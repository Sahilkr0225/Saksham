import { Request, Response } from 'express';
import pool from '../config/db';
import { createAuditLog } from '../utils/audit';

// ─── Helper: generate unique receipt number ───────────────────────────────────
// Format: FEE-YYYY-NNNN  (e.g. FEE-2627-0042)
const generateReceiptNumber = async (academicYearId: string): Promise<string> => {
  const yearResult = await pool.query(
    `SELECT name FROM academic_years WHERE id = $1`, [academicYearId]
  );
  const yearName = yearResult.rows[0]?.name ?? 'XXXX';
  // Strip non-digits and take last 4 chars of year (e.g. "2026-27" → "2627")
  const yearCode = yearName.replace(/\D/g, '').slice(-4).padEnd(4, '0');

  const countResult = await pool.query(
    `SELECT COUNT(*) FROM fee_payments WHERE academic_year_id = $1`, [academicYearId]
  );
  const seq = (parseInt(countResult.rows[0].count) + 1).toString().padStart(4, '0');
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
    const { student_id, academic_year_id, amount_paid, payment_mode, payment_date, cheque_number, bank_name, reference_number, notes } = req.body;
    const userId = (req as any).user?.userId;

    await client.query('BEGIN');

    // Get student's fee assignment
    const assignmentResult = await client.query(
      `SELECT sfa.*, fs.due_date
       FROM student_fee_assignments sfa
       JOIN fee_structures fs ON sfa.fee_structure_id = fs.id
       WHERE sfa.student_id = $1 AND sfa.academic_year_id = $2`,
      [student_id, academic_year_id]
    );
    if (assignmentResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, message: 'No fee assignment found for this student and academic year' });
    }

    const assignment = assignmentResult.rows[0];

    // Get total already paid
    const paidResult = await client.query(
      `SELECT COALESCE(SUM(amount_paid), 0) AS total_paid
       FROM fee_payments WHERE student_id = $1 AND academic_year_id = $2`,
      [student_id, academic_year_id]
    );
    const totalPaid = parseFloat(paidResult.rows[0].total_paid);

    // Get existing advance credit
    const ledgerResult = await client.query(
      `SELECT advance_credit FROM student_fee_ledger WHERE student_id = $1 AND academic_year_id = $2`,
      [student_id, academic_year_id]
    );
    const existingCredit = ledgerResult.rows.length > 0 ? parseFloat(ledgerResult.rows[0].advance_credit) : 0;

    const totalOwed = parseFloat(assignment.total_amount);
    // Effective paid = payments + existing advance credit
    const effectivePaid = totalPaid + existingCredit;
    const currentBalance = totalOwed - effectivePaid;

    // Generate receipt number
    const receiptNumber = await generateReceiptNumber(academic_year_id);

    // Record the payment
    const paymentResult = await client.query(
      `INSERT INTO fee_payments (student_id, academic_year_id, receipt_number, amount_paid, payment_mode, payment_date, cheque_number, bank_name, reference_number, notes, collected_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING *`,
      [student_id, academic_year_id, receiptNumber, amount_paid, payment_mode, payment_date || new Date().toISOString().split('T')[0], cheque_number || null, bank_name || null, reference_number || null, notes || null, userId]
    );

    // Handle advance credit: if payment > remaining balance, excess is advance
    let newAdvanceCredit = existingCredit;
    if (amount_paid > currentBalance) {
      const excess = amount_paid - Math.max(currentBalance, 0);
      newAdvanceCredit = existingCredit + excess;
    } else {
      // If student has advance credit and balance, apply it (reduce credit)
      // Credit was already factored into effectivePaid above, no adjustment needed here
      // Only reset if fully paid with this payment
      newAdvanceCredit = existingCredit; // unchanged unless overpayment occurred
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

    await createAuditLog({ userId, action: 'CREATE', resource: 'fee_payments', resourceId: paymentResult.rows[0].id, oldValue: null, newValue: paymentResult.rows[0], ipAddress: req.ip });

    res.status(201).json({
      success: true,
      message: 'Payment recorded successfully',
      data: {
        payment: paymentResult.rows[0],
        summary: {
          total_owed: totalOwed,
          total_paid: totalPaid + amount_paid,
          advance_credit: newAdvanceCredit,
          balance_due: Math.max(0, currentBalance - amount_paid)
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
      `SELECT fp.*, u.name AS collected_by_name
       FROM fee_payments fp
       LEFT JOIN users u ON fp.collected_by = u.id
       WHERE fp.student_id = $1 AND fp.academic_year_id = $2
       ORDER BY fp.payment_date DESC`,
      [studentId, assignment.academic_year_id]
    );

    // Ledger / advance credit
    const ledgerResult = await pool.query(
      `SELECT advance_credit FROM student_fee_ledger WHERE student_id = $1 AND academic_year_id = $2`,
      [studentId, assignment.academic_year_id]
    );

    const totalPaid = paymentsResult.rows.reduce((sum: number, p: any) => sum + parseFloat(p.amount_paid), 0);
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
        fee_structure: assignment.structure_name,
        class_name: assignment.class_name,
        due_date: assignment.due_date,
        total_owed: totalOwed,
        total_paid: totalPaid,
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

    const result = await pool.query(
      `SELECT fp.*,
              u_student.name AS student_name,
              s.admission_number, s.roll_number,
              c.name AS class_name,
              ay.name AS academic_year_name,
              u_staff.name AS collected_by_name,
              fs.name AS fee_structure_name, fs.due_date
       FROM fee_payments fp
       JOIN students s ON fp.student_id = s.id
       JOIN users u_student ON s.user_id = u_student.id
       JOIN student_fee_assignments sfa ON sfa.student_id = s.id AND sfa.academic_year_id = fp.academic_year_id
       JOIN fee_structures fs ON sfa.fee_structure_id = fs.id
       JOIN classes c ON fs.class_id = c.id
       JOIN academic_years ay ON fp.academic_year_id = ay.id
       LEFT JOIN users u_staff ON fp.collected_by = u_staff.id
       WHERE fp.id = $1`,
      [paymentId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Payment / receipt not found' });
    }

    const payment = result.rows[0];

    // Get all components for context
    const componentsResult = await pool.query(
      `SELECT name, amount, is_optional FROM fee_components
       WHERE fee_structure_id = (
         SELECT fee_structure_id FROM student_fee_assignments
         WHERE student_id = $1 AND academic_year_id = $2
       )`,
      [payment.student_id, payment.academic_year_id]
    );

    res.status(200).json({
      success: true,
      data: {
        receipt: {
          receipt_number: payment.receipt_number,
          payment_date: payment.payment_date,
          payment_mode: payment.payment_mode,
          amount_paid: payment.amount_paid,
          cheque_number: payment.cheque_number,
          bank_name: payment.bank_name,
          reference_number: payment.reference_number,
          notes: payment.notes,
          collected_by: payment.collected_by_name,
        },
        student: {
          name: payment.student_name,
          admission_number: payment.admission_number,
          roll_number: payment.roll_number,
          class: payment.class_name,
          academic_year: payment.academic_year_name,
        },
        fee_breakdown: componentsResult.rows,
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

    // Overall totals
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
           FROM fee_payments GROUP BY student_id, academic_year_id
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
           FROM fee_payments GROUP BY student_id, academic_year_id
       ) fp_totals ON fp_totals.student_id = sfa.student_id AND fp_totals.academic_year_id = sfa.academic_year_id
       ${yearFilter}
       GROUP BY c.id, c.name, c.display_order
       ORDER BY c.display_order ASC`,
      params
    );

    // Payment mode breakdown
    const modeBreakdownResult = await pool.query(
      `SELECT payment_mode, COUNT(*) AS count, SUM(amount_paid) AS total
       FROM fee_payments
       ${academic_year_id ? 'WHERE academic_year_id = $1' : ''}
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
