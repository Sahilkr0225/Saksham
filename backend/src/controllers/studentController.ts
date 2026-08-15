import { Request, Response, NextFunction } from 'express';
import pool from '../config/db';
import { createAuditLog } from '../utils/audit';

/**
 * GET /api/v1/students
 * Fetch paginated list of students with optional search & class/section/status filters
 */
export const getStudents = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 10));
    const offset = (page - 1) * limit;

    const { class_id, section_id, status, search } = req.query;

    const conditions: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;

    if (class_id) {
      conditions.push(`s.current_class_id = $${paramIndex++}`);
      params.push(class_id);
    }
    if (section_id) {
      conditions.push(`s.current_section_id = $${paramIndex++}`);
      params.push(section_id);
    }
    if (status) {
      conditions.push(`s.status = $${paramIndex++}`);
      params.push(status);
    }
    if (search) {
      conditions.push(`(u.name ILIKE $${paramIndex} OR u.email ILIKE $${paramIndex} OR s.admission_number ILIKE $${paramIndex})`);
      params.push(`%${(search as string).trim()}%`);
      paramIndex++;
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const dataQuery = `
      SELECT 
        s.id, s.admission_number, s.admission_date, s.dob, s.gender,
        s.current_class_id, s.current_section_id, s.roll_number,
        s.blood_group, s.address, s.emergency_contact, s.status,
        u.name as student_name, u.email as student_email, u.phone as student_phone,
        u.avatar_url as student_avatar_url,
        c.name as class_name, c.code as class_code,
        sec.name as section_name
      FROM students s
      JOIN users u ON s.user_id = u.id
      LEFT JOIN classes c ON s.current_class_id = c.id
      LEFT JOIN sections sec ON s.current_section_id = sec.id
      ${whereClause}
      ORDER BY s.created_at DESC
      LIMIT $${paramIndex++} OFFSET $${paramIndex++}
    `;

    const countQuery = `
      SELECT COUNT(*) as total
      FROM students s
      JOIN users u ON s.user_id = u.id
      ${whereClause}
    `;

    const dataParams = [...params, limit, offset];
    const [dataResult, countResult] = await Promise.all([
      pool.query(dataQuery, dataParams),
      pool.query(countQuery, params)
    ]);

    const total = parseInt(countResult.rows[0].total) || 0;
    const totalPages = Math.ceil(total / limit);

    res.status(200).json({
      success: true,
      message: 'Students fetched successfully',
      data: {
        students: dataResult.rows,
        pagination: { page, limit, total, total_pages: totalPages }
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/v1/students/:id
 * Retrieve a specific student detailed profile.
 * Implements security check: Students/Parents can only fetch check their own records.
 */
export const getStudentById = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { id } = req.params;
    const currentUserId = (req as any).user?.userId;
    const currentUserRole = (req as any).user?.role;

    const query = `
      SELECT 
        s.*,
        u.name as student_name, u.email as student_email, u.phone as student_phone,
        u.avatar_url as student_avatar_url, u.is_active as user_active,
        c.name as class_name, c.code as class_code,
        sec.name as section_name,
        p.name as parent_name, p.email as parent_email, p.phone as parent_phone
      FROM students s
      JOIN users u ON s.user_id = u.id
      LEFT JOIN classes c ON s.current_class_id = c.id
      LEFT JOIN sections sec ON s.current_section_id = sec.id
      LEFT JOIN users p ON s.parent_user_id = p.id
      WHERE s.id = $1
    `;
    const result = await pool.query(query, [id]);

    if (result.rowCount === 0) {
      res.status(404).json({ success: false, message: 'Student record not found' });
      return;
    }

    const student = result.rows[0];

    // RBAC Security Validation for specific roles
    if (currentUserRole === 'student' && student.user_id !== currentUserId) {
      res.status(403).json({ success: false, message: 'Access forbidden: You can only query your own student file' });
      return;
    }

    if (currentUserRole === 'parent' && student.parent_user_id !== currentUserId) {
      res.status(403).json({ success: false, message: 'Access forbidden: You can only query children linked to your parent file' });
      return;
    }

    res.status(200).json({
      success: true,
      message: 'Student record fetched successfully',
      data: { student }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * PUT /api/v1/students/:id
 * Update student registration / personal fields.
 */
export const updateStudent = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { id } = req.params;
    const { dob, gender, roll_number, blood_group, address, emergency_contact } = req.body;
    const adminUserId = (req as any).user?.userId;
    const ipAddress = req.ip || req.socket.remoteAddress || null;
    const userAgent = req.headers['user-agent'] || null;

    // Fetch existing record
    const existingResult = await pool.query('SELECT * FROM students WHERE id = $1', [id]);
    if (existingResult.rowCount === 0) {
      res.status(404).json({ success: false, message: 'Student record not found' });
      return;
    }

    const existingStudent = existingResult.rows[0];

    const query = `
      UPDATE students
      SET 
        dob = COALESCE($1, dob),
        gender = COALESCE($2, gender),
        roll_number = COALESCE($3, roll_number),
        blood_group = COALESCE($4, blood_group),
        address = COALESCE($5, address),
        emergency_contact = COALESCE($6, emergency_contact),
        updated_at = NOW()
      WHERE id = $7
      RETURNING *
    `;

    const result = await pool.query(query, [
      dob || null,
      gender || null,
      roll_number !== undefined ? roll_number : existingStudent.roll_number,
      blood_group !== undefined ? blood_group : existingStudent.blood_group,
      address !== undefined ? address : existingStudent.address,
      emergency_contact !== undefined ? emergency_contact : existingStudent.emergency_contact,
      id
    ]);

    await createAuditLog({
      userId: adminUserId,
      action: 'UPDATE',
      resource: 'students',
      resourceId: id,
      oldValue: existingStudent,
      newValue: result.rows[0],
      ipAddress,
      userAgent
    });

    res.status(200).json({
      success: true,
      message: 'Student record updated successfully',
      data: { student: result.rows[0] }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * PATCH /api/v1/students/:id/status
 * Alter the enrollment state of the student file (e.g. transferred, suspended)
 */
export const updateStudentStatus = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { id } = req.params;
    const { status, remarks } = req.body;
    const adminUserId = (req as any).user?.userId;
    const ipAddress = req.ip || req.socket.remoteAddress || null;
    const userAgent = req.headers['user-agent'] || null;

    const existingResult = await pool.query('SELECT status FROM students WHERE id = $1', [id]);
    if (existingResult.rowCount === 0) {
      res.status(404).json({ success: false, message: 'Student record not found' });
      return;
    }

    const previousStatus = existingResult.rows[0].status;

    const result = await pool.query(
      `UPDATE students
       SET status = $1, updated_at = NOW()
       WHERE id = $2
       RETURNING *`,
      [status, id]
    );

    await createAuditLog({
      userId: adminUserId,
      action: 'UPDATE',
      resource: 'students',
      resourceId: id,
      oldValue: { status: previousStatus },
      newValue: { status, remarks },
      ipAddress,
      userAgent
    });

    res.status(200).json({
      success: true,
      message: `Student status updated to '${status}' successfully`,
      data: { student: result.rows[0] }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * PATCH /api/v1/students/:id/section
 * Promote or transition a student to a different class / section sequence
 */
export const assignStudentSection = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { id } = req.params;
    const { class_id, section_id, roll_number } = req.body;
    const adminUserId = (req as any).user?.userId;
    const ipAddress = req.ip || req.socket.remoteAddress || null;
    const userAgent = req.headers['user-agent'] || null;

    // Check student existence
    const existingResult = await pool.query('SELECT * FROM students WHERE id = $1', [id]);
    if (existingResult.rowCount === 0) {
      res.status(404).json({ success: false, message: 'Student record not found' });
      return;
    }

    const student = existingResult.rows[0];

    // Validate class
    const classCheck = await pool.query('SELECT id FROM classes WHERE id = $1', [class_id]);
    if (classCheck.rowCount === 0) {
      res.status(404).json({ success: false, message: 'Class record not found' });
      return;
    }

    // Validate section matches class context if provided
    if (section_id) {
      const sectionCheck = await pool.query('SELECT id FROM sections WHERE id = $1 AND class_id = $2', [section_id, class_id]);
      if (sectionCheck.rowCount === 0) {
        res.status(400).json({ success: false, message: 'Specified section does not belong to the targeted class' });
        return;
      }
    }

    const result = await pool.query(
      `UPDATE students
       SET 
         current_class_id = $1,
         current_section_id = $2,
         roll_number = COALESCE($3, roll_number),
         updated_at = NOW()
       WHERE id = $4
       RETURNING *`,
      [class_id, section_id || null, roll_number || null, id]
    );

    await createAuditLog({
      userId: adminUserId,
      action: 'UPDATE',
      resource: 'students',
      resourceId: id,
      oldValue: {
        current_class_id: student.current_class_id,
        current_section_id: student.current_section_id,
        roll_number: student.roll_number
      },
      newValue: {
        current_class_id: class_id,
        current_section_id: section_id || null,
        roll_number: roll_number || null
      },
      ipAddress,
      userAgent
    });

    res.status(200).json({
      success: true,
      message: 'Student assigned to class / section successfully',
      data: { student: result.rows[0] }
    });
  } catch (error) {
    next(error);
  }
};
