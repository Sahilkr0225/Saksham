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

    await client.query('BEGIN');

    // 1. Lock and validate admission application inside transaction
    const admissionResult = await client.query(
      'SELECT * FROM admission_applications WHERE id = $1 FOR UPDATE',
      [id]
    );
    if (admissionResult.rowCount === 0) {
      await client.query('ROLLBACK');
      res.status(404).json({ success: false, message: 'Admission application not found' });
      return;
    }

    const admission = admissionResult.rows[0];

    if (admission.status !== 'approved') {
      await client.query('ROLLBACK');
      res.status(400).json({
        success: false,
        message: `Only approved applications can be enrolled. Current status: '${admission.status}'`
      });
      return;
    }

    // 2. Verify section belongs to the applied class, lock section FOR UPDATE, and check capacity & roll uniqueness
    if (current_section_id) {
      const secCheck = await client.query(
        'SELECT id, capacity FROM sections WHERE id = $1 AND class_id = $2 FOR UPDATE',
        [current_section_id, admission.applied_class_id]
      );
      if (secCheck.rowCount === 0) {
        await client.query('ROLLBACK');
        res.status(400).json({
          success: false,
          message: 'Specified section does not belong to the applied class'
        });
        return;
      }

      const section = secCheck.rows[0];
      if (section.capacity !== null && section.capacity !== undefined) {
        const countRes = await client.query(
          `SELECT COUNT(*)::int as count FROM students 
           WHERE current_section_id = $1 AND status = 'active'`,
          [current_section_id]
        );
        if (countRes.rows[0].count >= section.capacity) {
          await client.query('ROLLBACK');
          res.status(409).json({
            success: false,
            message: `Section has reached its maximum capacity of ${section.capacity} students`
          });
          return;
        }
      }

      if (roll_number) {
        const rollCheck = await client.query(
          `SELECT id FROM students 
           WHERE current_section_id = $1 AND roll_number = $2 AND status = 'active'`,
          [current_section_id, roll_number]
        );
        if ((rollCheck.rowCount ?? 0) > 0) {
          await client.query('ROLLBACK');
          res.status(409).json({
            success: false,
            message: `Roll number '${roll_number}' is already assigned to another active student in this section`
          });
          return;
        }
      }
    }

    // 3. Generate student user credentials
    const studentTempPassword = `Temp@${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
    const studentPasswordHash = await hashPassword(studentTempPassword);
    const admissionNumber = `STU-${new Date().getFullYear()}-${String(Date.now()).slice(-6)}`;
    const cleanAdmNo = admissionNumber.toLowerCase().replace(/[^a-z0-9]/g, '');
    const studentEmail = `${cleanAdmNo}@student.saksham.edu`;

    const studentUserResult = await client.query(
      `INSERT INTO users (name, email, password_hash, is_active, must_change_password)
       VALUES ($1, $2, $3, TRUE, TRUE)
       RETURNING id, name, email`,
      [admission.applicant_name.trim(), studentEmail, studentPasswordHash]
    );
    const studentUserId = studentUserResult.rows[0].id;

    // Assign student role
    const studentRoleResult = await client.query(`SELECT id FROM roles WHERE name = 'student'`);
    if (studentRoleResult.rowCount === 0) {
      await client.query('ROLLBACK');
      res.status(500).json({ success: false, message: "System role 'student' not configured" });
      return;
    }
    await client.query(
      `INSERT INTO user_roles (user_id, role_id, assigned_by, is_active)
       VALUES ($1, $2, $3, TRUE)`,
      [studentUserId, studentRoleResult.rows[0].id, adminUserId]
    );

    // 4. Handle Parent User Account (Lookup / Auto-Onboard / Reuse)
    const parentEmail = admission.parent_email?.toLowerCase().trim();
    if (!parentEmail) {
      await client.query('ROLLBACK');
      res.status(400).json({ success: false, message: 'Admission application is missing a parent email address' });
      return;
    }

    let parentUserId: string;
    let parentAccountData: {
      id: string;
      name: string;
      email: string;
      temporary_password: string | null;
      is_new_account: boolean;
    };

    // Check if account already exists with this email (lock FOR UPDATE to prevent concurrency races)
    const existingUserResult = await client.query(
      `SELECT u.id, u.name, u.email, u.phone, u.is_active, u.deleted_at
       FROM users u
       WHERE LOWER(TRIM(u.email)) = $1
       FOR UPDATE`,
      [parentEmail]
    );

    if ((existingUserResult.rowCount ?? 0) > 0) {
      const existingUser = existingUserResult.rows[0];

      // Check account state rules
      if (existingUser.deleted_at || !existingUser.is_active) {
        await client.query('ROLLBACK');
        res.status(400).json({
          success: false,
          message: `The parent account associated with email '${parentEmail}' is deactivated or closed. Please reactivate the account before proceeding with student enrollment.`
        });
        return;
      }

      // Check active roles for this user
      const rolesResult = await client.query(
        `SELECT r.name FROM user_roles ur
         JOIN roles r ON ur.role_id = r.id
         WHERE ur.user_id = $1 AND ur.is_active = true`,
        [existingUser.id]
      );
      const activeRoles = rolesResult.rows.map((r: any) => r.name);

      if (activeRoles.includes('parent')) {
        // Case B: Existing valid parent account — reuse without resetting credentials or overwriting profile
        parentUserId = existingUser.id;
        parentAccountData = {
          id: existingUser.id,
          name: existingUser.name,
          email: existingUser.email,
          temporary_password: null,
          is_new_account: false
        };
      } else {
        // Case C: Existing account with an incompatible role
        await client.query('ROLLBACK');
        res.status(409).json({
          success: false,
          message: `An account with email '${parentEmail}' already exists with role '${activeRoles.join(', ')}' and cannot be used as a parent account. Please provide a distinct parent email address or update the user's role.`
        });
        return;
      }
    } else {
      // Case A: New parent account creation
      const parentTempPassword = `Temp@${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
      const parentPasswordHash = await hashPassword(parentTempPassword);

      const newParentResult = await client.query(
        `INSERT INTO users (name, email, password_hash, phone, is_active, must_change_password)
         VALUES ($1, $2, $3, $4, TRUE, TRUE)
         RETURNING id, name, email, phone`,
        [admission.parent_name.trim(), parentEmail, parentPasswordHash, admission.parent_phone || null]
      );
      parentUserId = newParentResult.rows[0].id;

      const parentRoleResult = await client.query(`SELECT id FROM roles WHERE name = 'parent'`);
      if (parentRoleResult.rowCount === 0) {
        await client.query('ROLLBACK');
        res.status(500).json({ success: false, message: "System role 'parent' not configured" });
        return;
      }

      await client.query(
        `INSERT INTO user_roles (user_id, role_id, assigned_by, is_active)
         VALUES ($1, $2, $3, TRUE)`,
        [parentUserId, parentRoleResult.rows[0].id, adminUserId]
      );

      // Audit log for new parent account creation
      await createAuditLog({
        userId: adminUserId,
        action: 'CREATE',
        resource: 'users',
        resourceId: parentUserId,
        newValue: { id: parentUserId, name: admission.parent_name.trim(), email: parentEmail, role: 'parent' }
      });

      parentAccountData = {
        id: parentUserId,
        name: admission.parent_name.trim(),
        email: parentEmail,
        temporary_password: parentTempPassword,
        is_new_account: true
      };
    }

    // 5. Create student record and link to parent account
    const studentResult = await client.query(
      `INSERT INTO students
         (user_id, admission_number, admission_date, dob, gender,
          current_class_id, current_section_id, roll_number,
          blood_group, emergency_contact, parent_user_id, status)
       VALUES ($1, $2, CURRENT_DATE, $3, $4, $5, $6, $7, $8, $9, $10, 'active')
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
        emergency_contact || null,
        parentUserId
      ]
    );

    // 6. Mark admission application as enrolled
    await client.query(
      `UPDATE admission_applications
       SET status = 'enrolled', updated_at = NOW()
       WHERE id = $1`,
      [id]
    );

    // Commit atomic transaction
    await client.query('COMMIT');

    // 7. Audit log for admission enrollment
    await createAuditLog({
      userId: adminUserId,
      action: 'ENROLL',
      resource: 'admission_applications',
      resourceId: id,
      newValue: {
        status: 'enrolled',
        student_id: studentResult.rows[0].id,
        parent_user_id: parentUserId
      }
    });

    res.status(201).json({
      success: true,
      message: `Applicant '${admission.applicant_name}' enrolled successfully as a student and linked to parent account`,
      data: {
        student: studentResult.rows[0],
        user_email: studentEmail,
        temporary_password: studentTempPassword,
        admission_number: admissionNumber,
        parent_account: parentAccountData
      }
    });
  } catch (error: any) {
    await client.query('ROLLBACK');
    if (error.code === '23505') {
      if (error.constraint === 'uk_students_active_section_roll') {
        res.status(409).json({
          success: false,
          message: `Roll number '${req.body.roll_number}' is already assigned to another active student in this section`
        });
        return;
      }
      if (error.constraint === 'users_email_key') {
        res.status(409).json({
          success: false,
          message: 'A user account with this email address was created concurrently. Please retry.'
        });
        return;
      }
    }
    next(error);
  } finally {
    client.release();
  }
};
