import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import pool from '../config/db';
import { hashPassword } from '../utils/auth';
import { createAuditLog } from '../utils/audit';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Generates a unique application number in the format APP-<YEAR>-<5-digit-seq>
 * e.g. APP-2026-00001
 */
const generateApplicationNumber = async (): Promise<string> => {
  const year = new Date().getFullYear();
  const result = await pool.query(
    `SELECT COUNT(*) as total FROM admission_applications
     WHERE application_number LIKE $1`,
    [`APP-${year}-%`]
  );
  const seq = parseInt(result.rows[0].total) + 1;
  return `APP-${year}-${String(seq).padStart(5, '0')}`;
};

// ─── Handlers ─────────────────────────────────────────────────────────────────

/**
 * POST /api/v1/admissions
 * Submit a new admission application
 */
export const createAdmission = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const {
      applicant_name, dob, gender,
      applied_class_id, academic_year_id,
      parent_name, parent_email, parent_phone,
      address, remarks
    } = req.body;
    const userId = (req as any).user?.userId;

    // Verify referenced class exists
    const classCheck = await pool.query('SELECT id FROM classes WHERE id = $1', [applied_class_id]);
    if (classCheck.rowCount === 0) {
      res.status(404).json({ success: false, message: 'Specified class does not exist' });
      return;
    }

    // Verify referenced academic year exists
    const yearCheck = await pool.query('SELECT id FROM academic_years WHERE id = $1', [academic_year_id]);
    if (yearCheck.rowCount === 0) {
      res.status(404).json({ success: false, message: 'Specified academic year does not exist' });
      return;
    }

    const applicationNumber = await generateApplicationNumber();

    const query = `
      INSERT INTO admission_applications
        (application_number, applicant_name, dob, gender, applied_class_id, academic_year_id,
         parent_name, parent_email, parent_phone, address, remarks, status)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'submitted')
      RETURNING *
    `;
    const result = await pool.query(query, [
      applicationNumber, applicant_name.trim(), dob, gender,
      applied_class_id, academic_year_id,
      parent_name.trim(), parent_email.toLowerCase().trim(), parent_phone,
      address || null, remarks || null
    ]);

    await createAuditLog({
      userId,
      action: 'CREATE',
      resource: 'admission_applications',
      resourceId: result.rows[0].id,
      newValue: result.rows[0]
    });

    res.status(201).json({
      success: true,
      message: 'Admission application submitted successfully',
      data: { admission: result.rows[0] }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/v1/admissions
 * Fetch paginated list of admission applications with optional filters
 */
export const getAdmissions = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const page  = Math.max(1, parseInt(req.query.page  as string) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 10));
    const offset = (page - 1) * limit;

    const { status, applied_class_id, academic_year_id, search } = req.query;

    const conditions: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;

    if (status) {
      conditions.push(`a.status = $${paramIndex++}`);
      params.push(status);
    }
    if (applied_class_id) {
      conditions.push(`a.applied_class_id = $${paramIndex++}`);
      params.push(applied_class_id);
    }
    if (academic_year_id) {
      conditions.push(`a.academic_year_id = $${paramIndex++}`);
      params.push(academic_year_id);
    }
    if (search) {
      conditions.push(`(a.applicant_name ILIKE $${paramIndex} OR a.application_number ILIKE $${paramIndex} OR a.parent_email ILIKE $${paramIndex})`);
      params.push(`%${(search as string).trim()}%`);
      paramIndex++;
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const dataQuery = `
      SELECT a.*, c.name as class_name, ay.name as academic_year_name
      FROM admission_applications a
      JOIN classes c ON a.applied_class_id = c.id
      JOIN academic_years ay ON a.academic_year_id = ay.id
      ${whereClause}
      ORDER BY a.created_at DESC
      LIMIT $${paramIndex++} OFFSET $${paramIndex++}
    `;

    const countQuery = `
      SELECT COUNT(*) as total
      FROM admission_applications a
      ${whereClause}
    `;

    const dataParams  = [...params, limit, offset];
    const [dataResult, countResult] = await Promise.all([
      pool.query(dataQuery, dataParams),
      pool.query(countQuery, params)
    ]);

    const total      = parseInt(countResult.rows[0].total) || 0;
    const totalPages = Math.ceil(total / limit);

    res.status(200).json({
      success: true,
      message: 'Admission applications fetched successfully',
      data: {
        admissions: dataResult.rows,
        pagination: { page, limit, total, total_pages: totalPages }
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/v1/admissions/:id
 * Fetch a single admission application by ID
 */
export const getAdmissionById = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { id } = req.params;

    const query = `
      SELECT a.*, c.name as class_name, c.code as class_code,
             ay.name as academic_year_name
      FROM admission_applications a
      JOIN classes c ON a.applied_class_id = c.id
      JOIN academic_years ay ON a.academic_year_id = ay.id
      WHERE a.id = $1
    `;
    const result = await pool.query(query, [id]);

    if (result.rowCount === 0) {
      res.status(404).json({ success: false, message: 'Admission application not found' });
      return;
    }

    res.status(200).json({
      success: true,
      message: 'Admission application fetched successfully',
      data: { admission: result.rows[0] }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * PATCH /api/v1/admissions/:id/status
 * Update the status of an admission application
 */
export const updateAdmissionStatus = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { id } = req.params;
    const { status, remarks } = req.body;
    const userId = (req as any).user?.userId;

    // Fetch existing application
    const existing = await pool.query('SELECT * FROM admission_applications WHERE id = $1', [id]);
    if (existing.rowCount === 0) {
      res.status(404).json({ success: false, message: 'Admission application not found' });
      return;
    }

    const admission = existing.rows[0];

    // Guard: cannot manually set status to 'enrolled' — use the /enroll endpoint
    if (status === 'enrolled') {
      res.status(400).json({
        success: false,
        message: "Cannot set status to 'enrolled' directly. Use the POST /admissions/:id/enroll endpoint."
      });
      return;
    }

    // Guard: cannot change status of an already enrolled application
    if (admission.status === 'enrolled') {
      res.status(400).json({
        success: false,
        message: 'This application is already enrolled and cannot be modified.'
      });
      return;
    }

    const result = await pool.query(
      `UPDATE admission_applications
       SET status = $1, remarks = COALESCE($2, remarks), updated_at = NOW()
       WHERE id = $3
       RETURNING *`,
      [status, remarks || null, id]
    );

    await createAuditLog({
      userId,
      action: 'UPDATE',
      resource: 'admission_applications',
      resourceId: id,
      oldValue: { status: admission.status },
      newValue: { status, remarks }
    });

    res.status(200).json({
      success: true,
      message: `Application status updated to '${status}'`,
      data: { admission: result.rows[0] }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/v1/admissions/:id/enroll
 * Convert an approved admission into a student record.
 * Creates a user account (role: student) + students table entry.
 */
export const enrollStudent = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  const client = await pool.connect();
  try {
    const { id } = req.params;
    const { current_section_id, roll_number, blood_group, emergency_contact } = req.body;
    const adminUserId = (req as any).user?.userId;

    // 1. Validate admission exists and is approved
    const admissionResult = await client.query(
      'SELECT * FROM admission_applications WHERE id = $1',
      [id]
    );
    if (admissionResult.rowCount === 0) {
      res.status(404).json({ success: false, message: 'Admission application not found' });
      return;
    }

    const admission = admissionResult.rows[0];

    if (admission.status !== 'approved') {
      res.status(400).json({
        success: false,
        message: `Only approved applications can be enrolled. Current status: '${admission.status}'`
      });
      return;
    }

    // 2. Verify section belongs to the applied class (if provided)
    if (current_section_id) {
      const secCheck = await client.query(
        'SELECT id FROM sections WHERE id = $1 AND class_id = $2',
        [current_section_id, admission.applied_class_id]
      );
      if (secCheck.rowCount === 0) {
        res.status(400).json({
          success: false,
          message: 'Specified section does not belong to the applied class'
        });
        return;
      }
    }

    // 3. Generate student user credentials
    const tempPassword  = `Temp@${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
    const passwordHash  = await hashPassword(tempPassword);
    const studentEmail  = admission.parent_email; // Use parent email as student login by default
    const admissionNumber = `STU-${new Date().getFullYear()}-${String(Date.now()).slice(-6)}`;

    await client.query('BEGIN');

    // 4. Create user account for student (email = parent_email)
    //    If account already exists skip creation gracefully
    let studentUserId: string;

    const existingUser = await client.query(
      'SELECT id FROM users WHERE email = $1',
      [studentEmail]
    );

    if ((existingUser.rowCount ?? 0) > 0) {
      studentUserId = existingUser.rows[0].id;
    } else {
      const userResult = await client.query(
        `INSERT INTO users (name, email, password_hash, is_active, must_change_password)
         VALUES ($1, $2, $3, TRUE, TRUE)
         RETURNING id`,
        [admission.applicant_name, studentEmail, passwordHash]
      );
      studentUserId = userResult.rows[0].id;

      // Assign student role
      const roleResult = await client.query(`SELECT id FROM roles WHERE name = 'student'`);
      await client.query(
        `INSERT INTO user_roles (user_id, role_id, assigned_by, is_active)
         VALUES ($1, $2, $3, TRUE)`,
        [studentUserId, roleResult.rows[0].id, adminUserId]
      );
    }

    // 5. Create student record
    const studentResult = await client.query(
      `INSERT INTO students
         (user_id, admission_number, admission_date, dob, gender,
          current_class_id, current_section_id, roll_number,
          blood_group, emergency_contact, status)
       VALUES ($1, $2, CURRENT_DATE, $3, $4, $5, $6, $7, $8, $9, 'active')
       RETURNING *`,
      [
        studentUserId,
        admissionNumber,
        admission.dob,
        admission.gender,
        admission.applied_class_id,
        current_section_id || null,
        roll_number       || null,
        blood_group       || null,
        emergency_contact || null
      ]
    );

    // 6. Mark admission as enrolled
    await client.query(
      `UPDATE admission_applications
       SET status = 'enrolled', updated_at = NOW()
       WHERE id = $1`,
      [id]
    );

    await client.query('COMMIT');

    // 7. Audit logs
    await createAuditLog({
      userId: adminUserId,
      action: 'ENROLL',
      resource: 'admission_applications',
      resourceId: id,
      newValue: { status: 'enrolled', student_id: studentResult.rows[0].id }
    });

    res.status(201).json({
      success: true,
      message: `Applicant '${admission.applicant_name}' enrolled successfully as a student`,
      data: {
        student: studentResult.rows[0],
        user_email: studentEmail,
        temporary_password: (existingUser.rowCount ?? 0) > 0 ? null : tempPassword,
        admission_number: admissionNumber
      }
    });
  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally {
    client.release();
  }
};
