import { Request, Response } from 'express';
import pool from '../config/db';
import { createAuditLog } from '../utils/audit';

// POST /api/v1/homework
export const createHomework = async (req: Request, res: Response) => {
  try {
    const { title, description, class_id, subject_id, section_id, academic_year_id, due_date } = req.body;
    const userId = (req as any).user?.userId;

    const result = await pool.query(`
      INSERT INTO homework_assignments (title, description, class_id, subject_id, section_id, academic_year_id, assigned_by, due_date)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *
    `, [title, description || null, class_id, subject_id, section_id || null, academic_year_id, userId, due_date]);

    await createAuditLog({ userId, action: 'CREATE', resource: 'homework', resourceId: result.rows[0].id, oldValue: null, newValue: result.rows[0], ipAddress: req.ip });

    res.status(201).json({ success: true, message: 'Homework created successfully', data: { homework: result.rows[0] } });
  } catch (error: any) {
    res.status(500).json({ success: false, message: 'Server error', data: { error: error.message } });
  }
};

// GET /api/v1/homework/class/:classId
export const getHomeworkForClass = async (req: Request, res: Response) => {
  try {
    const { classId } = req.params;
    const { subject_id, status = 'active' } = req.query;

    const queryParams: any[] = [classId, status];
    let query = `
      SELECT h.*, s.name as subject_name, u.name as teacher_name
      FROM homework_assignments h
      JOIN subjects s ON h.subject_id = s.id
      LEFT JOIN users u ON h.assigned_by = u.id
      WHERE h.class_id = $1 AND h.status = $2
    `;

    if (subject_id) {
      queryParams.push(subject_id);
      query += ` AND h.subject_id = $${queryParams.length}`;
    }

    query += ` ORDER BY h.due_date ASC`;

    const result = await pool.query(query, queryParams);
    res.status(200).json({ success: true, data: { homework: result.rows } });
  } catch (error: any) {
    res.status(500).json({ success: false, message: 'Server error', data: { error: error.message } });
  }
};

// GET /api/v1/homework/my  — for students (reads their class)
export const getMyHomework = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.userId;

    // Get student's current class
    const studentResult = await pool.query(`
      SELECT s.id, s.current_class_id, s.current_section_id FROM students s
      JOIN users u ON s.user_id = u.id WHERE u.id = $1
    `, [userId]);

    if (studentResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Student profile not found' });
    }

    const { id: studentId, current_class_id, current_section_id } = studentResult.rows[0];

    const result = await pool.query(`
      SELECT h.id, h.title, h.description, h.due_date, h.subject_id,
             s.name as subject_name,
             (SELECT COUNT(*) FROM homework_submissions hs WHERE hs.homework_id = h.id AND hs.student_id = $3) as attempt_count
      FROM homework_assignments h
      JOIN subjects s ON h.subject_id = s.id
      WHERE h.class_id = $1 AND h.status = 'active'
        AND (h.section_id IS NULL OR h.section_id = $2)
      ORDER BY h.due_date ASC
    `, [current_class_id, current_section_id, studentId]);

    res.status(200).json({ success: true, data: { homework: result.rows } });
  } catch (error: any) {
    res.status(500).json({ success: false, message: 'Server error', data: { error: error.message } });
  }
};

// POST /api/v1/homework/:homeworkId/submit  — for students
export const submitHomework = async (req: Request, res: Response) => {
  try {
    const { homeworkId } = req.params;
    const { remarks } = req.body;
    const userId = (req as any).user?.userId;

    // Get student profile
    const studentResult = await pool.query(`SELECT id FROM students WHERE user_id = $1`, [userId]);
    if (studentResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Student profile not found' });
    }
    const studentId = studentResult.rows[0].id;

    // Check existing submission count
    const countResult = await pool.query(`
      SELECT COUNT(*) FROM homework_submissions WHERE homework_id = $1 AND student_id = $2
    `, [homeworkId, studentId]);
    const existingCount = parseInt(countResult.rows[0].count);

    if (existingCount >= 2) {
      return res.status(409).json({ success: false, message: 'Maximum submission attempts (2) reached for this assignment' });
    }

    const attemptNumber = existingCount + 1;

    // Check if submission is late
    const hwResult = await pool.query(`SELECT due_date FROM homework_assignments WHERE id = $1`, [homeworkId]);
    if (hwResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Homework assignment not found' });
    }
    const isLate = new Date() > new Date(hwResult.rows[0].due_date);
    const status = isLate ? 'late' : 'submitted';

    const result = await pool.query(`
      INSERT INTO homework_submissions (homework_id, student_id, attempt_number, status, remarks)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
    `, [homeworkId, studentId, attemptNumber, status, remarks || null]);

    res.status(201).json({
      success: true,
      message: `Attempt ${attemptNumber} submitted successfully${isLate ? ' (marked as Late)' : ''}`,
      data: { submission: result.rows[0] }
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: 'Server error', data: { error: error.message } });
  }
};

// GET /api/v1/homework/:homeworkId/submissions  — for teachers
export const getSubmissions = async (req: Request, res: Response) => {
  try {
    const { homeworkId } = req.params;

    const result = await pool.query(`
      SELECT hs.id, hs.attempt_number, hs.status, hs.remarks, hs.submitted_at,
             u.name as student_name, s.roll_number, s.id as student_id
      FROM homework_submissions hs
      JOIN students s ON hs.student_id = s.id
      JOIN users u ON s.user_id = u.id
      WHERE hs.homework_id = $1
      ORDER BY u.name ASC, hs.attempt_number ASC
    `, [homeworkId]);

    res.status(200).json({ success: true, data: { submissions: result.rows } });
  } catch (error: any) {
    res.status(500).json({ success: false, message: 'Server error', data: { error: error.message } });
  }
};

// PATCH /api/v1/homework/submissions/:submissionId  — teacher grades
export const updateSubmission = async (req: Request, res: Response) => {
  try {
    const { submissionId } = req.params;
    const { status, remarks } = req.body;
    const userId = (req as any).user?.userId;

    const existing = await pool.query(`SELECT * FROM homework_submissions WHERE id = $1`, [submissionId]);
    if (existing.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Submission not found' });
    }

    const result = await pool.query(`
      UPDATE homework_submissions SET status = $1, remarks = $2, updated_at = NOW()
      WHERE id = $3 RETURNING *
    `, [status, remarks || null, submissionId]);

    await createAuditLog({ userId, action: 'UPDATE', resource: 'homework_submissions', resourceId: submissionId, oldValue: existing.rows[0], newValue: result.rows[0], ipAddress: req.ip });

    res.status(200).json({ success: true, message: 'Submission updated', data: { submission: result.rows[0] } });
  } catch (error: any) {
    res.status(500).json({ success: false, message: 'Server error', data: { error: error.message } });
  }
};
