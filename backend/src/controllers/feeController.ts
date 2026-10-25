import { Request, Response } from 'express';
import pool from '../config/db';
import { createAuditLog } from '../utils/audit';

// ─── Helper: generate concurrency-safe unique receipt number ──────────────────
// Format: FEE-YYYY-NNNN (e.g. FEE-2627-0042) using atomic PostgreSQL sequence
const generateReceiptNumber = async (client: any, academicYearId: string): Promise<string> => {
  const yearResult = await client.query(
    `SELECT name FROM academic_years WHERE id = $1`, [academicYearId]
  );
  const yearName = yearResult.rows[0]?.name ?? 'XXXX';
  // Strip non-digits and take last 4 chars of year (e.g. "2026-27" → "2627")
  const yearCode = yearName.replace(/\D/g, '').slice(-4).padEnd(4, '0');

  // Concurrency-safe atomic sequence increment (prevents race collisions)
  const seqResult = await client.query(`SELECT nextval('fee_receipt_seq') AS seq`);
  const seq = seqResult.rows[0].seq.toString().padStart(4, '0');
  return `FEE-${yearCode}-${seq}`;
};

// ─── Helper: recalculate and update fee_structures.total_amount ───────────────
const syncStructureTotalAmount = async (feeStructureId: string): Promise<number> => {
  const result = await pool.query(
    `SELECT COALESCE(SUM(amount), 0) AS total FROM fee_components WHERE fee_structure_id = $1`,
    [feeStructureId]
  );
  const total = parseFloat(result.rows[0].total);
  await pool.query(
    `UPDATE fee_structures SET total_amount = $1, updated_at = NOW() WHERE id = $2`,
    [total, feeStructureId]
  );
  return total;
};

// ════════════════════════════════════════════════════════════
// FEE STRUCTURES
// ════════════════════════════════════════════════════════════

// POST /api/v1/fees/structures
export const createFeeStructure = async (req: Request, res: Response) => {
  const client = await pool.connect();
  try {
    const { name, class_id, academic_year_id, due_date, description, components } = req.body;
    const userId = (req as any).user?.userId;

    await client.query('BEGIN');

    // Check for duplicate structure (same class + year)
    const existing = await client.query(
      `SELECT id FROM fee_structures WHERE class_id = $1 AND academic_year_id = $2`,
      [class_id, academic_year_id]
    );
    if ((existing.rowCount ?? 0) > 0) {
      await client.query('ROLLBACK');
      return res.status(409).json({ success: false, message: 'A fee structure already exists for this class and academic year' });
    }

    // Calculate total from components
    const total = components.reduce((sum: number, c: any) => sum + c.amount, 0);

    // Insert fee structure
    const structureResult = await client.query(
      `INSERT INTO fee_structures (name, class_id, academic_year_id, due_date, total_amount, description, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [name, class_id, academic_year_id, due_date, total, description || null, userId]
    );
    const structure = structureResult.rows[0];

    // Insert components
    const insertedComponents = [];
    for (const comp of components) {
      const compResult = await client.query(
        `INSERT INTO fee_components (fee_structure_id, name, amount, is_optional)
         VALUES ($1, $2, $3, $4) RETURNING *`,
        [structure.id, comp.name, comp.amount, comp.is_optional ?? false]
      );
      insertedComponents.push(compResult.rows[0]);
    }

    await client.query('COMMIT');

    await createAuditLog({ userId, action: 'CREATE', resource: 'fee_structures', resourceId: structure.id, oldValue: null, newValue: structure, ipAddress: req.ip });

    res.status(201).json({
      success: true,
      message: 'Fee structure created successfully',
      data: { structure: { ...structure, components: insertedComponents } }
    });
  } catch (error: any) {
    await client.query('ROLLBACK');
    res.status(500).json({ success: false, message: 'Server error', data: { error: error.message } });
  } finally {
    client.release();
  }
};

// GET /api/v1/fees/structures?class_id=&academic_year_id=
export const listFeeStructures = async (req: Request, res: Response) => {
  try {
    const { class_id, academic_year_id } = req.query;

    const params: any[] = [];
    let where = 'WHERE 1=1';

    if (class_id) { params.push(class_id); where += ` AND fs.class_id = $${params.length}`; }
    if (academic_year_id) { params.push(academic_year_id); where += ` AND fs.academic_year_id = $${params.length}`; }

    const result = await pool.query(
      `SELECT fs.*, c.name AS class_name, ay.name AS academic_year_name, u.name AS created_by_name
       FROM fee_structures fs
       JOIN classes c ON fs.class_id = c.id
       JOIN academic_years ay ON fs.academic_year_id = ay.id
       LEFT JOIN users u ON fs.created_by = u.id
       ${where}
       ORDER BY c.display_order ASC, fs.created_at DESC`,
      params
    );

    res.status(200).json({ success: true, data: { structures: result.rows } });
  } catch (error: any) {
    res.status(500).json({ success: false, message: 'Server error', data: { error: error.message } });
  }
};

// GET /api/v1/fees/structures/:id
export const getFeeStructureById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const structureResult = await pool.query(
      `SELECT fs.*, c.name AS class_name, ay.name AS academic_year_name, u.name AS created_by_name
       FROM fee_structures fs
       JOIN classes c ON fs.class_id = c.id
       JOIN academic_years ay ON fs.academic_year_id = ay.id
       LEFT JOIN users u ON fs.created_by = u.id
       WHERE fs.id = $1`, [id]
    );

    if (structureResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Fee structure not found' });
    }

    const componentsResult = await pool.query(
      `SELECT * FROM fee_components WHERE fee_structure_id = $1 ORDER BY is_optional ASC, name ASC`, [id]
    );

    res.status(200).json({
      success: true,
      data: { structure: { ...structureResult.rows[0], components: componentsResult.rows } }
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: 'Server error', data: { error: error.message } });
  }
};

// PATCH /api/v1/fees/structures/:id
export const updateFeeStructure = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { name, due_date, description } = req.body;
    const userId = (req as any).user?.userId;

    const existing = await pool.query(`SELECT * FROM fee_structures WHERE id = $1`, [id]);
    if (existing.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Fee structure not found' });
    }

    const result = await pool.query(
      `UPDATE fee_structures
       SET name = COALESCE($1, name),
           due_date = COALESCE($2, due_date),
           description = COALESCE($3, description),
           updated_at = NOW()
       WHERE id = $4 RETURNING *`,
      [name || null, due_date || null, description || null, id]
    );

    await createAuditLog({ userId, action: 'UPDATE', resource: 'fee_structures', resourceId: id, oldValue: existing.rows[0], newValue: result.rows[0], ipAddress: req.ip });

    res.status(200).json({ success: true, message: 'Fee structure updated', data: { structure: result.rows[0] } });
  } catch (error: any) {
    res.status(500).json({ success: false, message: 'Server error', data: { error: error.message } });
  }
};

// ════════════════════════════════════════════════════════════
// FEE COMPONENTS
// ════════════════════════════════════════════════════════════

// POST /api/v1/fees/structures/:id/components
export const addFeeComponent = async (req: Request, res: Response) => {
  try {
    const { id: feeStructureId } = req.params;
    const { name, amount, is_optional } = req.body;
    const userId = (req as any).user?.userId;

    const structureCheck = await pool.query(`SELECT id FROM fee_structures WHERE id = $1`, [feeStructureId]);
    if (structureCheck.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Fee structure not found' });
    }

    const result = await pool.query(
      `INSERT INTO fee_components (fee_structure_id, name, amount, is_optional)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [feeStructureId, name, amount, is_optional ?? false]
    );

    // Sync total_amount on parent structure
    const newTotal = await syncStructureTotalAmount(feeStructureId);

    await createAuditLog({ userId, action: 'CREATE', resource: 'fee_components', resourceId: result.rows[0].id, oldValue: null, newValue: result.rows[0], ipAddress: req.ip });

    res.status(201).json({
      success: true,
      message: 'Fee component added',
      data: { component: result.rows[0], new_structure_total: newTotal }
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: 'Server error', data: { error: error.message } });
  }
};

// PATCH /api/v1/fees/components/:componentId
export const updateFeeComponent = async (req: Request, res: Response) => {
  try {
    const { componentId } = req.params;
    const { name, amount, is_optional } = req.body;
    const userId = (req as any).user?.userId;

    const existing = await pool.query(`SELECT * FROM fee_components WHERE id = $1`, [componentId]);
    if (existing.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Fee component not found' });
    }

    const result = await pool.query(
      `UPDATE fee_components
       SET name = COALESCE($1, name),
           amount = COALESCE($2, amount),
           is_optional = COALESCE($3, is_optional),
           updated_at = NOW()
       WHERE id = $4 RETURNING *`,
      [name || null, amount ?? null, is_optional ?? null, componentId]
    );

    // Sync parent structure total
    const newTotal = await syncStructureTotalAmount(existing.rows[0].fee_structure_id);

    await createAuditLog({ userId, action: 'UPDATE', resource: 'fee_components', resourceId: componentId, oldValue: existing.rows[0], newValue: result.rows[0], ipAddress: req.ip });

    res.status(200).json({
      success: true,
      message: 'Fee component updated',
      data: { component: result.rows[0], new_structure_total: newTotal }
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: 'Server error', data: { error: error.message } });
  }
};

// DELETE /api/v1/fees/components/:componentId
export const deleteFeeComponent = async (req: Request, res: Response) => {
  try {
    const { componentId } = req.params;
    const userId = (req as any).user?.userId;

    const existing = await pool.query(`SELECT * FROM fee_components WHERE id = $1`, [componentId]);
    if (existing.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Fee component not found' });
    }

    await pool.query(`DELETE FROM fee_components WHERE id = $1`, [componentId]);
    const newTotal = await syncStructureTotalAmount(existing.rows[0].fee_structure_id);

    await createAuditLog({ userId, action: 'DELETE', resource: 'fee_components', resourceId: componentId, oldValue: existing.rows[0], newValue: null, ipAddress: req.ip });

    res.status(200).json({
      success: true,
      message: 'Fee component deleted',
      data: { new_structure_total: newTotal }
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: 'Server error', data: { error: error.message } });
  }
};

// ════════════════════════════════════════════════════════════
// STUDENT FEE ASSIGNMENT
// ════════════════════════════════════════════════════════════

// POST /api/v1/fees/assign
export const assignFeeToStudent = async (req: Request, res: Response) => {
  const client = await pool.connect();
  try {
    const { student_id, fee_structure_id, academic_year_id, include_optional_component_ids = [] } = req.body;
    const userId = (req as any).user?.userId;

    await client.query('BEGIN');

    // Check student is active
    const studentCheck = await client.query(`SELECT id, status FROM students WHERE id = $1`, [student_id]);
    if (studentCheck.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, message: 'Student not found' });
    }
    if (studentCheck.rows[0].status !== 'active') {
      await client.query('ROLLBACK');
      return res.status(400).json({ success: false, message: 'Cannot assign fees to a non-active student' });
    }

    // Check no duplicate assignment
    const existingAssignment = await client.query(
      `SELECT id FROM student_fee_assignments WHERE student_id = $1 AND academic_year_id = $2`,
      [student_id, academic_year_id]
    );
    if ((existingAssignment.rowCount ?? 0) > 0) {
      await client.query('ROLLBACK');
      return res.status(409).json({ success: false, message: 'Student already has a fee assignment for this academic year' });
    }

    // Fetch fee structure and compute total (mandatory + selected optional components)
    const componentsResult = await client.query(
      `SELECT id, amount, is_optional FROM fee_components WHERE fee_structure_id = $1`,
      [fee_structure_id]
    );

    let total = 0;
    for (const comp of componentsResult.rows) {
      if (!comp.is_optional) {
        total += parseFloat(comp.amount);
      } else if (include_optional_component_ids.includes(comp.id)) {
        total += parseFloat(comp.amount);
      }
    }

    // Create assignment
    const assignResult = await client.query(
      `INSERT INTO student_fee_assignments (student_id, fee_structure_id, academic_year_id, total_amount, assigned_by)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [student_id, fee_structure_id, academic_year_id, total, userId]
    );

    // Initialise ledger entry (advance credit = 0) if not exists
    await client.query(
      `INSERT INTO student_fee_ledger (student_id, academic_year_id, advance_credit)
       VALUES ($1, $2, 0)
       ON CONFLICT (student_id, academic_year_id) DO NOTHING`,
      [student_id, academic_year_id]
    );

    await client.query('COMMIT');

    await createAuditLog({ userId, action: 'CREATE', resource: 'student_fee_assignments', resourceId: assignResult.rows[0].id, oldValue: null, newValue: assignResult.rows[0], ipAddress: req.ip });

    res.status(201).json({
      success: true,
      message: 'Fee structure assigned to student successfully',
      data: { assignment: assignResult.rows[0] }
    });
  } catch (error: any) {
    await client.query('ROLLBACK');
    res.status(500).json({ success: false, message: 'Server error', data: { error: error.message } });
  } finally {
    client.release();
  }
};

// ════════════════════════════════════════════════════════════
// PAYMENTS
// ════════════════════════════════════════════════════════════

// POST /api/v1/fees/payments
export const recordPayment = async (req: Request, res: Response) => {
  const client = await pool.connect();
  try {
    const {
      student_id,
      academic_year_id,
      amount_paid,
      payment_mode,
      payment_date,
      cheque_number,
      bank_name,
      reference_number,
      notes,
    } = req.body;
    const userId = (req as any).user?.userId;

    // Extract idempotency key from header or body
    const rawIdempotencyKey = (
      req.headers['idempotency-key'] ||
      req.headers['x-idempotency-key'] ||
      req.body?.idempotency_key
    );
    const idempotencyKey = typeof rawIdempotencyKey === 'string' && rawIdempotencyKey.trim().length > 0
      ? rawIdempotencyKey.trim().slice(0, 100)
      : null;

    await client.query('BEGIN');

    // Idempotency pre-check: if request key was already processed, return existing record
    if (idempotencyKey) {
      const existingPayment = await client.query(
        `SELECT fp.*, sfa.total_amount AS assignment_total
         FROM fee_payments fp
         JOIN student_fee_assignments sfa ON fp.student_id = sfa.student_id AND fp.academic_year_id = sfa.academic_year_id
         WHERE fp.idempotency_key = $1`,
        [idempotencyKey]
      );
      if (existingPayment.rows.length > 0) {
        await client.query('ROLLBACK');
        const payment = existingPayment.rows[0];

        // Retrieve current aggregated financial summary for this student (realized completed funds only)
        const paidResult = await pool.query(
          `SELECT COALESCE(SUM(amount_paid), 0) AS total_paid
           FROM fee_payments
           WHERE student_id = $1 AND academic_year_id = $2
             AND status = 'completed'
             AND (payment_mode != 'cheque' OR cheque_status = 'cleared')`,
          [payment.student_id, payment.academic_year_id]
        );
        const ledgerResult = await pool.query(
          `SELECT advance_credit FROM student_fee_ledger WHERE student_id = $1 AND academic_year_id = $2`,
          [payment.student_id, payment.academic_year_id]
        );
        const totalPaid = parseFloat(paidResult.rows[0].total_paid);
        const advanceCredit = ledgerResult.rows.length > 0 ? parseFloat(ledgerResult.rows[0].advance_credit) : 0;
        const totalOwed = parseFloat(payment.assignment_total);
        const balanceDue = Math.max(0, totalOwed - totalPaid - advanceCredit);

        res.setHeader('Idempotent-Replay', 'true');
        return res.status(200).json({
          success: true,
          message: 'Payment already processed (idempotent replay)',
          data: {
            payment,
            summary: {
              total_owed: totalOwed,
              total_paid: totalPaid,
              advance_credit: advanceCredit,
              balance_due: balanceDue
            }
          }
        });
      }
    }

    // Lock student fee assignment row with FOR UPDATE OF sfa to serialize concurrent payments
    const assignmentResult = await client.query(
      `SELECT sfa.*, fs.due_date
       FROM student_fee_assignments sfa
       JOIN fee_structures fs ON sfa.fee_structure_id = fs.id
       WHERE sfa.student_id = $1 AND sfa.academic_year_id = $2
       FOR UPDATE OF sfa`,
      [student_id, academic_year_id]
    );
    if (assignmentResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, message: 'No fee assignment found for this student and academic year' });
    }

    const assignment = assignmentResult.rows[0];

    // Ensure ledger row exists, then lock row for update
    await client.query(
      `INSERT INTO student_fee_ledger (student_id, academic_year_id, advance_credit)
       VALUES ($1, $2, 0)
       ON CONFLICT (student_id, academic_year_id) DO NOTHING`,
      [student_id, academic_year_id]
    );

    const ledgerResult = await client.query(
      `SELECT advance_credit FROM student_fee_ledger
       WHERE student_id = $1 AND academic_year_id = $2
       FOR UPDATE`,
      [student_id, academic_year_id]
    );
    const existingCredit = ledgerResult.rows.length > 0 ? parseFloat(ledgerResult.rows[0].advance_credit) : 0;

    // Get total already realized paid
    const paidResult = await client.query(
      `SELECT COALESCE(SUM(amount_paid), 0) AS total_paid
       FROM fee_payments
       WHERE student_id = $1 AND academic_year_id = $2
         AND status = 'completed'
         AND (payment_mode != 'cheque' OR cheque_status = 'cleared')`,
      [student_id, academic_year_id]
    );
    const totalPaid = parseFloat(paidResult.rows[0].total_paid);

    const totalOwed = parseFloat(assignment.total_amount);
    // Effective paid = payments + existing advance credit
    const effectivePaid = totalPaid + existingCredit;
    const currentBalance = totalOwed - effectivePaid;

    // Determine initial cheque status and realization state
    const initialChequeStatus = payment_mode === 'cheque' ? 'received' : null;
    const isRealizedPayment = payment_mode !== 'cheque';

    // Generate concurrency-safe unique receipt number via atomic sequence
    const receiptNumber = await generateReceiptNumber(client, academic_year_id);

    // Record the payment
    const paymentResult = await client.query(
      `INSERT INTO fee_payments (
        student_id, academic_year_id, receipt_number, amount_paid, payment_mode, payment_date,
        cheque_number, bank_name, reference_number, notes, collected_by, idempotency_key,
        status, cheque_status
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 'completed', $13)
      RETURNING *`,
      [
        student_id,
        academic_year_id,
        receiptNumber,
        amount_paid,
        payment_mode,
        payment_date || new Date().toISOString().split('T')[0],
        cheque_number || null,
        bank_name || null,
        reference_number || null,
        notes || null,
        userId,
        idempotencyKey,
        initialChequeStatus
      ]
    );

    // Handle advance credit: only realized payments can generate advance credit
    let newAdvanceCredit = existingCredit;
    if (isRealizedPayment && amount_paid > currentBalance) {
      const excess = amount_paid - Math.max(currentBalance, 0);
      newAdvanceCredit = existingCredit + excess;
    } else {
      newAdvanceCredit = existingCredit;
    }

    // Upsert ledger
    await client.query(
      `INSERT INTO student_fee_ledger (student_id, academic_year_id, advance_credit, last_updated_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (student_id, academic_year_id)
       DO UPDATE SET advance_credit = $3, last_updated_at = NOW()`,
      [student_id, academic_year_id, newAdvanceCredit]
    );

    await client.query('COMMIT');

    await createAuditLog({
      userId,
      action: 'CREATE',
      resource: 'fee_payments',
      resourceId: paymentResult.rows[0].id,
      oldValue: null,
      newValue: paymentResult.rows[0],
      ipAddress: req.ip
    });

    const responseTotalPaid = totalPaid + (isRealizedPayment ? amount_paid : 0);
    const responseBalanceDue = Math.max(0, currentBalance - (isRealizedPayment ? amount_paid : 0));

    res.status(201).json({
      success: true,
      message: 'Payment recorded successfully',
      data: {
        payment: paymentResult.rows[0],
        summary: {
          total_owed: totalOwed,
          total_paid: responseTotalPaid,
          advance_credit: newAdvanceCredit,
          balance_due: responseBalanceDue,
          cheque_status: initialChequeStatus
        }
      }
    });
  } catch (error: any) {
    await client.query('ROLLBACK');

    // Handle race-condition unique collision on idempotency key
    if (
      error.code === '23505' &&
      (error.constraint === 'uk_fee_payments_idempotency' || error.message?.includes('uk_fee_payments_idempotency'))
    ) {
      const idempotencyKey = (
        req.headers['idempotency-key'] ||
        req.headers['x-idempotency-key'] ||
        req.body?.idempotency_key
      )?.toString().trim();

      if (idempotencyKey) {
        try {
          const replayResult = await pool.query(
            `SELECT fp.*, sfa.total_amount AS assignment_total
             FROM fee_payments fp
             JOIN student_fee_assignments sfa ON fp.student_id = sfa.student_id AND fp.academic_year_id = sfa.academic_year_id
             WHERE fp.idempotency_key = $1`,
            [idempotencyKey]
          );
          if (replayResult.rows.length > 0) {
            const payment = replayResult.rows[0];
            const paidRes = await pool.query(
              `SELECT COALESCE(SUM(amount_paid), 0) AS total_paid
               FROM fee_payments
               WHERE student_id = $1 AND academic_year_id = $2
                 AND status = 'completed'
                 AND (payment_mode != 'cheque' OR cheque_status = 'cleared')`,
              [payment.student_id, payment.academic_year_id]
            );
            const ledgerRes = await pool.query(
              `SELECT advance_credit FROM student_fee_ledger WHERE student_id = $1 AND academic_year_id = $2`,
              [payment.student_id, payment.academic_year_id]
            );
            const totalPaid = parseFloat(paidRes.rows[0].total_paid);
            const advanceCredit = ledgerRes.rows.length > 0 ? parseFloat(ledgerRes.rows[0].advance_credit) : 0;
            const totalOwed = parseFloat(payment.assignment_total);
            const balanceDue = Math.max(0, totalOwed - totalPaid - advanceCredit);

            res.setHeader('Idempotent-Replay', 'true');
            return res.status(200).json({
              success: true,
              message: 'Payment already processed (idempotent replay)',
              data: {
                payment,
                summary: {
                  total_owed: totalOwed,
                  total_paid: totalPaid,
                  advance_credit: advanceCredit,
                  balance_due: balanceDue
                }
              }
            });
          }
        } catch {
          // Fall through to 500 if replay fetch fails
        }
      }
    }

    res.status(500).json({ success: false, message: 'Server error', data: { error: error.message } });
  } finally {
    client.release();
  }
};

// ════════════════════════════════════════════════════════════
// PAYMENT REVERSALS & CHEQUE LIFECYCLE
// ════════════════════════════════════════════════════════════

// POST /api/v1/fees/payments/:id/reverse
export const reversePayment = async (req: Request, res: Response) => {
  const client = await pool.connect();
  try {
    const { id } = req.params;
    const { reason } = req.body;
    const userId = (req as any).user?.userId;

    const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id);
    if (!isUUID) {
      return res.status(404).json({ success: false, message: 'Payment not found' });
    }

    await client.query('BEGIN');

    // 1. Lock payment row with FOR UPDATE
    const paymentResult = await client.query(
      `SELECT * FROM fee_payments WHERE id = $1 FOR UPDATE`,
      [id]
    );
    if (paymentResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, message: 'Payment not found' });
    }

    const payment = paymentResult.rows[0];

    // 2. Prevent duplicate reversal
    if (payment.status === 'reversed') {
      await client.query('ROLLBACK');
      return res.status(409).json({ success: false, message: 'Payment has already been reversed' });
    }

    // 3. Lock student fee assignment and ledger
    const assignmentResult = await client.query(
      `SELECT * FROM student_fee_assignments
       WHERE student_id = $1 AND academic_year_id = $2
       FOR UPDATE`,
      [payment.student_id, payment.academic_year_id]
    );
    const totalOwed = assignmentResult.rows.length > 0
      ? parseFloat(assignmentResult.rows[0].total_amount)
      : 0;

    const ledgerResult = await client.query(
      `SELECT advance_credit FROM student_fee_ledger
       WHERE student_id = $1 AND academic_year_id = $2
       FOR UPDATE`,
      [payment.student_id, payment.academic_year_id]
    );
    const existingCredit = ledgerResult.rows.length > 0
      ? parseFloat(ledgerResult.rows[0].advance_credit)
      : 0;

    // 4. Handle advance credit rollback safely (prevent negative underflow)
    const wasRealized = payment.status === 'completed' &&
      (payment.payment_mode !== 'cheque' || payment.cheque_status === 'cleared');

    let newAdvanceCredit = existingCredit;
    if (wasRealized) {
      // Query all OTHER realized payments for this student and academic year
      const otherPaidResult = await client.query(
        `SELECT COALESCE(SUM(amount_paid), 0) AS other_paid
         FROM fee_payments
         WHERE student_id = $1 AND academic_year_id = $2
           AND id != $3
           AND status = 'completed'
           AND (payment_mode != 'cheque' OR cheque_status = 'cleared')`,
        [payment.student_id, payment.academic_year_id, payment.id]
      );
      const otherPaid = parseFloat(otherPaidResult.rows[0].other_paid);
      const paymentAmount = parseFloat(payment.amount_paid);

      // How much excess above totalOwed did this payment contribute?
      const totalPaidWithThis = otherPaid + paymentAmount;
      const excessContributed = totalPaidWithThis > totalOwed
        ? Math.min(paymentAmount, totalPaidWithThis - totalOwed)
        : 0;

      // Deduct clamped excess so advance_credit >= 0 check constraint is never violated
      const creditDeduction = Math.min(existingCredit, excessContributed);
      newAdvanceCredit = existingCredit - creditDeduction;

      await client.query(
        `UPDATE student_fee_ledger
         SET advance_credit = $1, last_updated_at = NOW()
         WHERE student_id = $2 AND academic_year_id = $3`,
        [newAdvanceCredit, payment.student_id, payment.academic_year_id]
      );
    }

    // 5. Update payment to reversed
    const updateResult = await client.query(
      `UPDATE fee_payments
       SET status = 'reversed',
           reversed_at = NOW(),
           reversed_by = $1,
           reversal_reason = $2,
           updated_at = NOW()
       WHERE id = $3
       RETURNING *`,
      [userId, reason, id]
    );
    const updatedPayment = updateResult.rows[0];

    // 6. Calculate restored balance
    const restoredPaidResult = await client.query(
      `SELECT COALESCE(SUM(amount_paid), 0) AS total_paid
       FROM fee_payments
       WHERE student_id = $1 AND academic_year_id = $2
         AND status = 'completed'
         AND (payment_mode != 'cheque' OR cheque_status = 'cleared')`,
      [payment.student_id, payment.academic_year_id]
    );
    const restoredPaid = parseFloat(restoredPaidResult.rows[0].total_paid);
    const restoredBalanceDue = Math.max(0, totalOwed - restoredPaid - newAdvanceCredit);

    await client.query('COMMIT');

    // 7. Audit log
    await createAuditLog({
      userId,
      action: 'REVERSE',
      resource: 'fee_payments',
      resourceId: id,
      oldValue: payment,
      newValue: updatedPayment,
      ipAddress: req.ip
    });

    res.status(200).json({
      success: true,
      message: 'Payment reversed successfully',
      data: {
        payment: updatedPayment,
        restored_balance: {
          total_owed: totalOwed,
          total_paid: restoredPaid,
          advance_credit: newAdvanceCredit,
          balance_due: restoredBalanceDue,
        }
      }
    });
  } catch (error: any) {
    await client.query('ROLLBACK');
    res.status(500).json({ success: false, message: 'Server error', data: { error: error.message } });
  } finally {
    client.release();
  }
};

// PATCH /api/v1/fees/payments/:id/cheque-status
export const updateChequeStatus = async (req: Request, res: Response) => {
  const client = await pool.connect();
  try {
    const { id } = req.params;
    const { status, cleared_at, bounce_reason } = req.body;
    const userId = (req as any).user?.userId;

    const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id);
    if (!isUUID) {
      return res.status(404).json({ success: false, message: 'Payment not found' });
    }

    await client.query('BEGIN');

    // 1. Lock payment row
    const paymentResult = await client.query(
      `SELECT * FROM fee_payments WHERE id = $1 FOR UPDATE`,
      [id]
    );
    if (paymentResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, message: 'Payment not found' });
    }

    const payment = paymentResult.rows[0];

    // 2. Validate payment mode
    if (payment.payment_mode !== 'cheque') {
      await client.query('ROLLBACK');
      return res.status(400).json({ success: false, message: 'Cannot update cheque status for a non-cheque payment' });
    }

    // 3. Terminal state checks
    if (payment.status === 'reversed') {
      await client.query('ROLLBACK');
      return res.status(409).json({ success: false, message: 'Cannot update cheque status for a reversed payment' });
    }
    if (payment.cheque_status === 'cleared') {
      await client.query('ROLLBACK');
      return res.status(409).json({ success: false, message: 'Cheque is already cleared and cannot be changed' });
    }
    if (payment.cheque_status === 'bounced') {
      await client.query('ROLLBACK');
      return res.status(409).json({ success: false, message: 'Cheque has already bounced and cannot be changed' });
    }

    // 4. Lock assignment and ledger
    const assignmentResult = await client.query(
      `SELECT * FROM student_fee_assignments
       WHERE student_id = $1 AND academic_year_id = $2
       FOR UPDATE`,
      [payment.student_id, payment.academic_year_id]
    );
    const totalOwed = assignmentResult.rows.length > 0
      ? parseFloat(assignmentResult.rows[0].total_amount)
      : 0;

    const ledgerResult = await client.query(
      `SELECT advance_credit FROM student_fee_ledger
       WHERE student_id = $1 AND academic_year_id = $2
       FOR UPDATE`,
      [payment.student_id, payment.academic_year_id]
    );
    const existingCredit = ledgerResult.rows.length > 0
      ? parseFloat(ledgerResult.rows[0].advance_credit)
      : 0;

    let newChequeStatus = status;
    let newPaymentStatus = payment.status;
    let chequeClearedAt = payment.cheque_cleared_at;
    let chequeBounceReason = payment.cheque_bounce_reason;
    let newAdvanceCredit = existingCredit;

    if (status === 'cleared') {
      newChequeStatus = 'cleared';
      chequeClearedAt = cleared_at ? new Date(cleared_at).toISOString() : new Date().toISOString();
      newPaymentStatus = 'completed';

      // Calculate other realized payments
      const otherPaidResult = await client.query(
        `SELECT COALESCE(SUM(amount_paid), 0) AS other_paid
         FROM fee_payments
         WHERE student_id = $1 AND academic_year_id = $2
           AND id != $3
           AND status = 'completed'
           AND (payment_mode != 'cheque' OR cheque_status = 'cleared')`,
        [payment.student_id, payment.academic_year_id, payment.id]
      );
      const otherPaid = parseFloat(otherPaidResult.rows[0].other_paid);
      const chequeAmount = parseFloat(payment.amount_paid);
      const effectivePaidBefore = otherPaid + existingCredit;
      const balanceBefore = Math.max(0, totalOwed - effectivePaidBefore);

      if (chequeAmount > balanceBefore) {
        const excess = chequeAmount - balanceBefore;
        newAdvanceCredit = existingCredit + excess;
        await client.query(
          `UPDATE student_fee_ledger
           SET advance_credit = $1, last_updated_at = NOW()
           WHERE student_id = $2 AND academic_year_id = $3`,
          [newAdvanceCredit, payment.student_id, payment.academic_year_id]
        );
      }
    } else if (status === 'bounced') {
      newChequeStatus = 'bounced';
      newPaymentStatus = 'bounced';
      chequeBounceReason = bounce_reason || 'Cheque bounced';
    } else if (status === 'deposited') {
      newChequeStatus = 'deposited';
    }

    const updateResult = await client.query(
      `UPDATE fee_payments
       SET status = $1,
           cheque_status = $2,
           cheque_cleared_at = $3,
           cheque_bounce_reason = $4,
           updated_at = NOW()
       WHERE id = $5
       RETURNING *`,
      [newPaymentStatus, newChequeStatus, chequeClearedAt, chequeBounceReason, id]
    );
    const updatedPayment = updateResult.rows[0];

    // Calculate updated summary
    const paidResult = await client.query(
      `SELECT COALESCE(SUM(amount_paid), 0) AS total_paid
       FROM fee_payments
       WHERE student_id = $1 AND academic_year_id = $2
         AND status = 'completed'
         AND (payment_mode != 'cheque' OR cheque_status = 'cleared')`,
      [payment.student_id, payment.academic_year_id]
    );
    const totalPaid = parseFloat(paidResult.rows[0].total_paid);
    const balanceDue = Math.max(0, totalOwed - totalPaid - newAdvanceCredit);

    await client.query('COMMIT');

    await createAuditLog({
      userId,
      action: status === 'bounced' ? 'BOUNCE' : 'UPDATE',
      resource: 'fee_payments',
      resourceId: id,
      oldValue: payment,
      newValue: updatedPayment,
      ipAddress: req.ip
    });

    res.status(200).json({
      success: true,
      message: `Cheque status updated to ${status}`,
      data: {
        payment: updatedPayment,
        summary: {
          total_owed: totalOwed,
          total_paid: totalPaid,
          advance_credit: newAdvanceCredit,
          balance_due: balanceDue,
          cheque_status: newChequeStatus
        }
      }
    });
  } catch (error: any) {
    await client.query('ROLLBACK');
    res.status(500).json({ success: false, message: 'Server error', data: { error: error.message } });
  } finally {
    client.release();
  }
};

// GET /api/v1/fees/payments?academic_year_id=&status=&payment_mode=&cheque_status=&student_id=&search=&page=&limit=
export const listPayments = async (req: Request, res: Response) => {
  try {
    const {
      academic_year_id,
      status,
      payment_mode,
      cheque_status,
      student_id,
      search,
      page = '1',
      limit = '20'
    } = req.query;

    const pageNum = Math.max(1, parseInt(page as string) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit as string) || 20));
    const offset = (pageNum - 1) * limitNum;

    const params: any[] = [];
    let where = 'WHERE 1=1';

    if (academic_year_id) {
      params.push(academic_year_id);
      where += ` AND fp.academic_year_id = $${params.length}`;
    }
    if (status) {
      params.push(status);
      where += ` AND fp.status = $${params.length}`;
    }
    if (payment_mode) {
      params.push(payment_mode);
      where += ` AND fp.payment_mode = $${params.length}`;
    }
    if (cheque_status) {
      params.push(cheque_status);
      where += ` AND fp.cheque_status = $${params.length}`;
    }
    if (student_id) {
      params.push(student_id);
      where += ` AND fp.student_id = $${params.length}`;
    }
    if (search) {
      params.push(`%${search}%`);
      where += ` AND (u.name ILIKE $${params.length} OR s.admission_number ILIKE $${params.length} OR fp.receipt_number ILIKE $${params.length} OR fp.cheque_number ILIKE $${params.length})`;
    }

    // Count total
    const countResult = await pool.query(
      `SELECT COUNT(*) AS total
       FROM fee_payments fp
       JOIN students s ON fp.student_id = s.id
       JOIN users u ON s.user_id = u.id
       ${where}`,
      params
    );
    const totalRecords = parseInt(countResult.rows[0].total) || 0;

    // Fetch records with pagination
    const queryParams = [...params, limitNum, offset];
    const result = await pool.query(
      `SELECT fp.*,
              u.name AS student_name,
              s.admission_number,
              s.roll_number,
              c.name AS class_name,
              ay.name AS academic_year_name,
              u_staff.name AS collected_by_name,
              u_rev.name AS reversed_by_name
       FROM fee_payments fp
       JOIN students s ON fp.student_id = s.id
       JOIN users u ON s.user_id = u.id
       JOIN student_fee_assignments sfa ON sfa.student_id = s.id AND sfa.academic_year_id = fp.academic_year_id
       JOIN fee_structures fs ON sfa.fee_structure_id = fs.id
       JOIN classes c ON fs.class_id = c.id
       JOIN academic_years ay ON fp.academic_year_id = ay.id
       LEFT JOIN users u_staff ON fp.collected_by = u_staff.id
       LEFT JOIN users u_rev ON fp.reversed_by = u_rev.id
       ${where}
       ORDER BY fp.created_at DESC
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      queryParams
    );

    res.status(200).json({
      success: true,
      data: {
        total: totalRecords,
        page: pageNum,
        limit: limitNum,
        total_pages: Math.ceil(totalRecords / limitNum),
        payments: result.rows,
      }
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: 'Server error', data: { error: error.message } });
  }
};

// ════════════════════════════════════════════════════════════
// STUDENT FEE SUMMARY (dues, paid, balance, history)
// ════════════════════════════════════════════════════════════

// GET /api/v1/fees/student/:studentId?academic_year_id=
export const getStudentFeeSummary = async (req: Request, res: Response) => {
  try {
    const { studentId } = req.params;
    const { academic_year_id } = req.query;
    const loggedInUser = (req as any).user;

    // Role-based visibility: parent and student can only see their own data
    if (loggedInUser.role === 'student') {
      const studentCheck = await pool.query(`SELECT id FROM students WHERE user_id = $1 AND id = $2`, [loggedInUser.userId, studentId]);
      if (studentCheck.rows.length === 0) {
        return res.status(403).json({ success: false, message: 'Access denied' });
      }
    }
    if (loggedInUser.role === 'parent') {
      const parentCheck = await pool.query(`SELECT id FROM students WHERE parent_user_id = $1 AND id = $2`, [loggedInUser.userId, studentId]);
      if (parentCheck.rows.length === 0) {
        return res.status(403).json({ success: false, message: 'Access denied' });
      }
    }

    // Fetch assignment
    const assignmentResult = await pool.query(
      `SELECT sfa.*, fs.name AS structure_name, fs.due_date,
              c.name AS class_name, ay.name AS academic_year_name
       FROM student_fee_assignments sfa
       JOIN fee_structures fs ON sfa.fee_structure_id = fs.id
       JOIN classes c ON fs.class_id = c.id
       JOIN academic_years ay ON sfa.academic_year_id = ay.id
       WHERE sfa.student_id = $1
       ${academic_year_id ? 'AND sfa.academic_year_id = $2' : ''}
       ORDER BY sfa.assigned_at DESC`,
      academic_year_id ? [studentId, academic_year_id] : [studentId]
    );

    if (assignmentResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'No fee assignment found for this student' });
    }

    const assignment = assignmentResult.rows[0];

    // Payments
    const paymentsResult = await pool.query(
      `SELECT fp.*, u.name AS collected_by_name, u_rev.name AS reversed_by_name
       FROM fee_payments fp
       LEFT JOIN users u ON fp.collected_by = u.id
       LEFT JOIN users u_rev ON fp.reversed_by = u_rev.id
       WHERE fp.student_id = $1 AND fp.academic_year_id = $2
       ORDER BY fp.payment_date DESC, fp.created_at DESC`,
      [studentId, assignment.academic_year_id]
    );

    // Ledger / advance credit
    const ledgerResult = await pool.query(
      `SELECT advance_credit FROM student_fee_ledger WHERE student_id = $1 AND academic_year_id = $2`,
      [studentId, assignment.academic_year_id]
    );

    // Filter realized completed payments vs uncleared/pending cheques
    const realizedPayments = paymentsResult.rows.filter(
      (p: any) => p.status === 'completed' && (p.payment_mode !== 'cheque' || p.cheque_status === 'cleared')
    );
    const totalPaid = realizedPayments.reduce((sum: number, p: any) => sum + parseFloat(p.amount_paid), 0);
    const unclearedChequesAmount = paymentsResult.rows
      .filter((p: any) => p.status === 'completed' && p.payment_mode === 'cheque' && p.cheque_status !== 'cleared')
      .reduce((sum: number, p: any) => sum + parseFloat(p.amount_paid), 0);

    const advanceCredit = ledgerResult.rows.length > 0 ? parseFloat(ledgerResult.rows[0].advance_credit) : 0;
    const totalOwed = parseFloat(assignment.total_amount);
    const effectivePaid = totalPaid + advanceCredit;
    const balance = Math.max(0, totalOwed - effectivePaid);
    const isOverdue = new Date() > new Date(assignment.due_date) && balance > 0;

    // Student info
    const studentResult = await pool.query(
      `SELECT u.name, u.email, s.admission_number, s.roll_number
       FROM students s JOIN users u ON s.user_id = u.id WHERE s.id = $1`, [studentId]
    );

    res.status(200).json({
      success: true,
      data: {
        student: studentResult.rows[0],
        academic_year: assignment.academic_year_name,
        academic_year_id: assignment.academic_year_id,
        fee_structure: assignment.structure_name,
        fee_structure_id: assignment.fee_structure_id,
        class_name: assignment.class_name,
        due_date: assignment.due_date,
        total_owed: totalOwed,
        total_paid: totalPaid,
        uncleared_cheques_amount: unclearedChequesAmount,
        advance_credit: advanceCredit,
        balance_due: balance,
        is_overdue: isOverdue,
        status: balance === 0 ? 'paid' : isOverdue ? 'overdue' : 'pending',
        payments: paymentsResult.rows,
      }
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: 'Server error', data: { error: error.message } });
  }
};

// ════════════════════════════════════════════════════════════
// RECEIPT
// ════════════════════════════════════════════════════════════

// GET /api/v1/fees/receipts/:paymentId
export const getReceipt = async (req: Request, res: Response) => {
  try {
    const { paymentId } = req.params;
    const loggedInUser = (req as any).user;

    // Validate UUID format to prevent 22P02 database query error
    const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(paymentId);
    if (!isUUID) {
      return res.status(404).json({ success: false, message: 'Payment / receipt not found' });
    }

    const result = await pool.query(
      `SELECT fp.*,
              u_student.name AS student_name,
              s.admission_number, s.roll_number,
              c.name AS class_name,
              ay.name AS academic_year_name,
              u_staff.name AS collected_by_name,
              u_rev.name AS reversed_by_name,
              fs.name AS fee_structure_name, fs.due_date
       FROM fee_payments fp
       JOIN students s ON fp.student_id = s.id
       JOIN users u_student ON s.user_id = u_student.id
       JOIN student_fee_assignments sfa ON sfa.student_id = s.id AND sfa.academic_year_id = fp.academic_year_id
       JOIN fee_structures fs ON sfa.fee_structure_id = fs.id
       JOIN classes c ON fs.class_id = c.id
       JOIN academic_years ay ON fp.academic_year_id = ay.id
       LEFT JOIN users u_staff ON fp.collected_by = u_staff.id
       LEFT JOIN users u_rev ON fp.reversed_by = u_rev.id
       WHERE fp.id = $1`,
      [paymentId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Payment / receipt not found' });
    }

    const payment = result.rows[0];

    // Priority 1 — Strict Ownership and Access Control Check
    // Authorized staff roles (super_admin, principal, office_staff) have school-wide receipt access.
    // Student role can only access their own receipt.
    // Parent role can only access receipts of students linked to their parent account.
    if (loggedInUser.role === 'student') {
      const studentCheck = await pool.query(
        `SELECT id FROM students WHERE user_id = $1 AND id = $2`,
        [loggedInUser.userId, payment.student_id]
      );
      if (studentCheck.rows.length === 0) {
        // Privacy-preserving 404: Do not disclose whether another student's receipt exists
        return res.status(404).json({ success: false, message: 'Payment / receipt not found' });
      }
    } else if (loggedInUser.role === 'parent') {
      const parentCheck = await pool.query(
        `SELECT id FROM students WHERE parent_user_id = $1 AND id = $2`,
        [loggedInUser.userId, payment.student_id]
      );
      if (parentCheck.rows.length === 0) {
        // Privacy-preserving 404: Do not disclose whether another student's receipt exists
        return res.status(404).json({ success: false, message: 'Payment / receipt not found' });
      }
    } else if (
      loggedInUser.role !== 'super_admin' &&
      loggedInUser.role !== 'principal' &&
      loggedInUser.role !== 'office_staff'
    ) {
      return res.status(404).json({ success: false, message: 'Payment / receipt not found' });
    }

    // Financial status of student for this academic year
    const assignmentResult = await pool.query(
      `SELECT total_amount FROM student_fee_assignments
       WHERE student_id = $1 AND academic_year_id = $2`,
      [payment.student_id, payment.academic_year_id]
    );
    const totalOwed = assignmentResult.rows.length > 0 ? parseFloat(assignmentResult.rows[0].total_amount) : 0;

    const paidResult = await pool.query(
      `SELECT COALESCE(SUM(amount_paid), 0) AS total_paid
       FROM fee_payments
       WHERE student_id = $1 AND academic_year_id = $2
         AND status = 'completed'
         AND (payment_mode != 'cheque' OR cheque_status = 'cleared')`,
      [payment.student_id, payment.academic_year_id]
    );
    const cumulativePaid = parseFloat(paidResult.rows[0].total_paid);

    const ledgerResult = await pool.query(
      `SELECT advance_credit FROM student_fee_ledger
       WHERE student_id = $1 AND academic_year_id = $2`,
      [payment.student_id, payment.academic_year_id]
    );
    const advanceCredit = ledgerResult.rows.length > 0 ? parseFloat(ledgerResult.rows[0].advance_credit) : 0;
    const balanceRemaining = Math.max(0, totalOwed - cumulativePaid - advanceCredit);

    // Get all components for context
    const componentsResult = await pool.query(
      `SELECT name, amount, is_optional FROM fee_components
       WHERE fee_structure_id = (
         SELECT fee_structure_id FROM student_fee_assignments
         WHERE student_id = $1 AND academic_year_id = $2
       )
       ORDER BY is_optional ASC, created_at ASC`,
      [payment.student_id, payment.academic_year_id]
    );

    res.status(200).json({
      success: true,
      data: {
        receipt: {
          id: payment.id,
          receipt_number: payment.receipt_number,
          payment_date: payment.payment_date,
          payment_mode: payment.payment_mode,
          amount_paid: parseFloat(payment.amount_paid),
          cheque_number: payment.cheque_number,
          bank_name: payment.bank_name,
          reference_number: payment.reference_number,
          notes: payment.notes,
          collected_by: payment.collected_by_name,
          idempotency_key: payment.idempotency_key || null,
          status: payment.status,
          is_void: payment.status === 'reversed',
          reversed_at: payment.reversed_at || null,
          reversed_by: payment.reversed_by_name || payment.reversed_by || null,
          reversal_reason: payment.reversal_reason || null,
          cheque_status: payment.cheque_status || null,
          cheque_cleared_at: payment.cheque_cleared_at || null,
          cheque_bounce_reason: payment.cheque_bounce_reason || null,
        },
        student: {
          name: payment.student_name,
          admission_number: payment.admission_number,
          roll_number: payment.roll_number,
          class: payment.class_name,
          academic_year: payment.academic_year_name,
        },
        fee_breakdown: componentsResult.rows.map((c: any) => ({
          name: c.name,
          amount: parseFloat(c.amount),
          is_optional: c.is_optional,
        })),
        financial_summary: {
          total_fee_owed: totalOwed,
          cumulative_paid: cumulativePaid,
          advance_credit: advanceCredit,
          balance_remaining: balanceRemaining,
          settlement_status: balanceRemaining === 0 ? 'Fully Paid' : 'Partially Paid'
        },
        fee_structure: payment.fee_structure_name,
        due_date: payment.due_date,
      }
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: 'Server error', data: { error: error.message } });
  }
};

// ════════════════════════════════════════════════════════════
// DUES — PENDING & OVERDUE
// ════════════════════════════════════════════════════════════

// GET /api/v1/fees/dues/pending?academic_year_id=&class_id=
export const getPendingDues = async (req: Request, res: Response) => {
  try {
    const { academic_year_id, class_id } = req.query;

    const params: any[] = [];
    let classFilter = '';
    if (class_id) { params.push(class_id); classFilter = `AND fs.class_id = $${params.length}`; }
    if (academic_year_id) { params.push(academic_year_id); classFilter += ` AND sfa.academic_year_id = $${params.length}`; }

    const result = await pool.query(
      `SELECT
          s.id AS student_id,
          u.name AS student_name,
          s.admission_number,
          c.name AS class_name,
          ay.name AS academic_year,
          sfa.total_amount AS total_owed,
          fs.due_date,
          COALESCE(SUM(fp.amount_paid), 0)                        AS total_paid,
          COALESCE(sl.advance_credit, 0)                          AS advance_credit,
          sfa.total_amount - COALESCE(SUM(fp.amount_paid), 0) - COALESCE(sl.advance_credit, 0) AS balance_due,
          CASE WHEN NOW() > fs.due_date
               AND sfa.total_amount - COALESCE(SUM(fp.amount_paid), 0) - COALESCE(sl.advance_credit, 0) > 0
               THEN TRUE ELSE FALSE END                            AS is_overdue
       FROM student_fee_assignments sfa
       JOIN students s ON sfa.student_id = s.id
       JOIN users u ON s.user_id = u.id
       JOIN fee_structures fs ON sfa.fee_structure_id = fs.id
       JOIN classes c ON fs.class_id = c.id
       JOIN academic_years ay ON sfa.academic_year_id = ay.id
       LEFT JOIN fee_payments fp ON fp.student_id = s.id AND fp.academic_year_id = sfa.academic_year_id
            AND fp.status = 'completed' AND (fp.payment_mode != 'cheque' OR fp.cheque_status = 'cleared')
       LEFT JOIN student_fee_ledger sl ON sl.student_id = s.id AND sl.academic_year_id = sfa.academic_year_id
       ${classFilter ? 'WHERE 1=1 ' + classFilter : ''}
       GROUP BY s.id, u.name, s.admission_number, c.name, ay.name, sfa.total_amount, fs.due_date, sl.advance_credit
       HAVING sfa.total_amount - COALESCE(SUM(fp.amount_paid), 0) - COALESCE(sl.advance_credit, 0) > 0
       ORDER BY is_overdue DESC, balance_due DESC`,
      params
    );

    res.status(200).json({ success: true, data: { count: result.rows.length, students: result.rows } });
  } catch (error: any) {
    res.status(500).json({ success: false, message: 'Server error', data: { error: error.message } });
  }
};

// GET /api/v1/fees/dues/overdue?academic_year_id=&class_id=
export const getOverdueDues = async (req: Request, res: Response) => {
  try {
    const { academic_year_id, class_id } = req.query;

    const params: any[] = [];
    let classFilter = '';
    if (class_id) { params.push(class_id); classFilter = `AND fs.class_id = $${params.length}`; }
    if (academic_year_id) { params.push(academic_year_id); classFilter += ` AND sfa.academic_year_id = $${params.length}`; }

    const result = await pool.query(
      `SELECT
          s.id AS student_id,
          u.name AS student_name,
          s.admission_number,
          c.name AS class_name,
          ay.name AS academic_year,
          sfa.total_amount AS total_owed,
          fs.due_date,
          COALESCE(SUM(fp.amount_paid), 0)                        AS total_paid,
          COALESCE(sl.advance_credit, 0)                          AS advance_credit,
          sfa.total_amount - COALESCE(SUM(fp.amount_paid), 0) - COALESCE(sl.advance_credit, 0) AS overdue_amount,
          NOW()::date - fs.due_date                               AS days_overdue
       FROM student_fee_assignments sfa
       JOIN students s ON sfa.student_id = s.id
       JOIN users u ON s.user_id = u.id
       JOIN fee_structures fs ON sfa.fee_structure_id = fs.id
       JOIN classes c ON fs.class_id = c.id
       JOIN academic_years ay ON sfa.academic_year_id = ay.id
       LEFT JOIN fee_payments fp ON fp.student_id = s.id AND fp.academic_year_id = sfa.academic_year_id
            AND fp.status = 'completed' AND (fp.payment_mode != 'cheque' OR fp.cheque_status = 'cleared')
       LEFT JOIN student_fee_ledger sl ON sl.student_id = s.id AND sl.academic_year_id = sfa.academic_year_id
       ${classFilter ? 'WHERE NOW() > fs.due_date ' + classFilter : 'WHERE NOW() > fs.due_date'}
       GROUP BY s.id, u.name, s.admission_number, c.name, ay.name, sfa.total_amount, fs.due_date, sl.advance_credit
       HAVING sfa.total_amount - COALESCE(SUM(fp.amount_paid), 0) - COALESCE(sl.advance_credit, 0) > 0
       ORDER BY days_overdue DESC, overdue_amount DESC`,
      params
    );

    res.status(200).json({ success: true, data: { count: result.rows.length, overdue_students: result.rows } });
  } catch (error: any) {
    res.status(500).json({ success: false, message: 'Server error', data: { error: error.message } });
  }
};

// ════════════════════════════════════════════════════════════
// NOTIFICATIONS: UPCOMING & OVERDUE REMINDERS
// ════════════════════════════════════════════════════════════

// GET /api/v1/fees/notifications/upcoming?days=7&academic_year_id=
export const getUpcomingDueReminders = async (req: Request, res: Response) => {
  try {
    const { days = 7, academic_year_id } = req.query;
    const daysNum = parseInt(days as string) || 7;

    const params: any[] = [daysNum];
    let yearFilter = '';
    if (academic_year_id) { params.push(academic_year_id); yearFilter = `AND sfa.academic_year_id = $${params.length}`; }

    const result = await pool.query(
      `SELECT
          s.id AS student_id,
          u.name AS student_name,
          u.email AS student_email,
          s.admission_number,
          c.name AS class_name,
          fs.due_date,
          fs.due_date - NOW()::date AS days_until_due,
          sfa.total_amount AS total_owed,
          COALESCE(SUM(fp.amount_paid), 0) + COALESCE(sl.advance_credit, 0) AS effective_paid,
          sfa.total_amount - COALESCE(SUM(fp.amount_paid), 0) - COALESCE(sl.advance_credit, 0) AS balance_due
       FROM student_fee_assignments sfa
       JOIN students s ON sfa.student_id = s.id
       JOIN users u ON s.user_id = u.id
       JOIN fee_structures fs ON sfa.fee_structure_id = fs.id
       JOIN classes c ON fs.class_id = c.id
       LEFT JOIN fee_payments fp ON fp.student_id = s.id AND fp.academic_year_id = sfa.academic_year_id
            AND fp.status = 'completed' AND (fp.payment_mode != 'cheque' OR fp.cheque_status = 'cleared')
       LEFT JOIN student_fee_ledger sl ON sl.student_id = s.id AND sl.academic_year_id = sfa.academic_year_id
       WHERE fs.due_date BETWEEN NOW()::date AND (NOW()::date + $1::integer)
       ${yearFilter}
       GROUP BY s.id, u.name, u.email, s.admission_number, c.name, fs.due_date, sfa.total_amount, sl.advance_credit
       HAVING sfa.total_amount - COALESCE(SUM(fp.amount_paid), 0) - COALESCE(sl.advance_credit, 0) > 0
       ORDER BY fs.due_date ASC`,
      params
    );

    res.status(200).json({
      success: true,
      message: `${result.rows.length} students with fees due in next ${daysNum} days`,
      data: { count: result.rows.length, reminders: result.rows }
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: 'Server error', data: { error: error.message } });
  }
};

// GET /api/v1/fees/notifications/overdue?academic_year_id=
export const getOverdueReminders = async (req: Request, res: Response) => {
  try {
    const { academic_year_id } = req.query;
    const params: any[] = [];
    let yearFilter = '';
    if (academic_year_id) { params.push(academic_year_id); yearFilter = `AND sfa.academic_year_id = $1`; }

    const result = await pool.query(
      `SELECT
          s.id AS student_id,
          u.name AS student_name,
          u.email AS student_email,
          s.admission_number,
          c.name AS class_name,
          fs.due_date,
          NOW()::date - fs.due_date AS days_overdue,
          sfa.total_amount - COALESCE(SUM(fp.amount_paid), 0) - COALESCE(sl.advance_credit, 0) AS overdue_amount
       FROM student_fee_assignments sfa
       JOIN students s ON sfa.student_id = s.id
       JOIN users u ON s.user_id = u.id
       JOIN fee_structures fs ON sfa.fee_structure_id = fs.id
       JOIN classes c ON fs.class_id = c.id
       LEFT JOIN fee_payments fp ON fp.student_id = s.id AND fp.academic_year_id = sfa.academic_year_id
            AND fp.status = 'completed' AND (fp.payment_mode != 'cheque' OR fp.cheque_status = 'cleared')
       LEFT JOIN student_fee_ledger sl ON sl.student_id = s.id AND sl.academic_year_id = sfa.academic_year_id
       WHERE NOW() > fs.due_date ${yearFilter}
       GROUP BY s.id, u.name, u.email, s.admission_number, c.name, fs.due_date, sfa.total_amount, sl.advance_credit
       HAVING sfa.total_amount - COALESCE(SUM(fp.amount_paid), 0) - COALESCE(sl.advance_credit, 0) > 0
       ORDER BY days_overdue DESC`,
      params
    );

    res.status(200).json({
      success: true,
      message: `${result.rows.length} students with overdue fees`,
      data: { count: result.rows.length, overdue_reminders: result.rows }
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: 'Server error', data: { error: error.message } });
  }
};

// ════════════════════════════════════════════════════════════
// ANALYTICS
// ════════════════════════════════════════════════════════════

// GET /api/v1/fees/analytics/summary?academic_year_id=
export const getAnalyticsSummary = async (req: Request, res: Response) => {
  try {
    const { academic_year_id } = req.query;
    const params: any[] = [];
    let yearFilter = '';
    if (academic_year_id) { params.push(academic_year_id); yearFilter = `WHERE sfa.academic_year_id = $1`; }

    // Overall totals (counting realized funds only)
    const summaryResult = await pool.query(
      `SELECT
          COUNT(DISTINCT sfa.student_id)                            AS total_students_with_fees,
          COALESCE(SUM(sfa.total_amount), 0)                        AS total_fees_expected,
          COALESCE(SUM(fp_totals.paid), 0)                          AS total_collected,
          COALESCE(SUM(sfa.total_amount), 0) - COALESCE(SUM(fp_totals.paid), 0) AS total_pending,
          COUNT(CASE WHEN sfa.total_amount - COALESCE(fp_totals.paid, 0) - COALESCE(sl.advance_credit, 0) > 0
                      AND NOW() > fs.due_date THEN 1 END)            AS overdue_count,
          COALESCE(SUM(CASE WHEN NOW() > fs.due_date
                            AND sfa.total_amount - COALESCE(fp_totals.paid, 0) - COALESCE(sl.advance_credit, 0) > 0
                            THEN sfa.total_amount - COALESCE(fp_totals.paid, 0) - COALESCE(sl.advance_credit, 0)
                       END), 0)                                      AS total_overdue_amount
       FROM student_fee_assignments sfa
       JOIN fee_structures fs ON sfa.fee_structure_id = fs.id
       LEFT JOIN (
           SELECT student_id, academic_year_id, SUM(amount_paid) AS paid
           FROM fee_payments
           WHERE status = 'completed' AND (payment_mode != 'cheque' OR cheque_status = 'cleared')
           GROUP BY student_id, academic_year_id
       ) fp_totals ON fp_totals.student_id = sfa.student_id AND fp_totals.academic_year_id = sfa.academic_year_id
       LEFT JOIN student_fee_ledger sl ON sl.student_id = sfa.student_id AND sl.academic_year_id = sfa.academic_year_id
       ${yearFilter}`,
      params
    );

    // Class-wise breakdown
    const classBreakdownResult = await pool.query(
      `SELECT
          c.name AS class_name,
          COUNT(DISTINCT sfa.student_id)          AS student_count,
          COALESCE(SUM(sfa.total_amount), 0)      AS total_expected,
          COALESCE(SUM(fp_totals.paid), 0)        AS total_collected,
          COALESCE(SUM(sfa.total_amount), 0) - COALESCE(SUM(fp_totals.paid), 0) AS total_pending
       FROM student_fee_assignments sfa
       JOIN fee_structures fs ON sfa.fee_structure_id = fs.id
       JOIN classes c ON fs.class_id = c.id
       LEFT JOIN (
           SELECT student_id, academic_year_id, SUM(amount_paid) AS paid
           FROM fee_payments
           WHERE status = 'completed' AND (payment_mode != 'cheque' OR cheque_status = 'cleared')
           GROUP BY student_id, academic_year_id
       ) fp_totals ON fp_totals.student_id = sfa.student_id AND fp_totals.academic_year_id = sfa.academic_year_id
       ${yearFilter}
       GROUP BY c.id, c.name, c.display_order
       ORDER BY c.display_order ASC`,
      params
    );

    // Payment mode breakdown (realized completed funds)
    const modeBreakdownResult = await pool.query(
      `SELECT payment_mode, COUNT(*) AS count, SUM(amount_paid) AS total
       FROM fee_payments
       WHERE status = 'completed' AND (payment_mode != 'cheque' OR cheque_status = 'cleared')
       ${academic_year_id ? 'AND academic_year_id = $1' : ''}
       GROUP BY payment_mode`,
      params
    );

    const summary = summaryResult.rows[0];
    const collectionRate = summary.total_fees_expected > 0
      ? ((summary.total_collected / summary.total_fees_expected) * 100).toFixed(2)
      : '0.00';

    res.status(200).json({
      success: true,
      data: {
        summary: { ...summary, collection_rate_percent: parseFloat(collectionRate) },
        class_breakdown: classBreakdownResult.rows,
        payment_mode_breakdown: modeBreakdownResult.rows,
      }
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: 'Server error', data: { error: error.message } });
  }
};
