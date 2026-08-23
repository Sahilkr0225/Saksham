import { Request, Response } from 'express';
import pool from '../config/db';
import { createAuditLog } from '../utils/audit';

export const markBulkAttendance = async (req: Request, res: Response) => {
  const client = await pool.connect();
  try {
    const { class_id, academic_year_id, date, type, subject_id, records } = req.body;
    const userId = (req as any).user?.userId;
    const userRole = (req as any).user?.role;

    if (userRole !== 'teacher' && userRole !== 'principal' && userRole !== 'super_admin') {
      return res.status(403).json({ success: false, message: 'Not authorized to mark attendance' });
    }

    await client.query('BEGIN');

    const insertedRecords = [];

    for (const record of records) {
      const { student_id, status, remarks } = record;

      let query = '';
      let params = [];

      if (type === 'daily') {
        query = `
          INSERT INTO attendance_records (student_id, academic_year_id, date, type, status, remarks, marked_by)
          VALUES ($1, $2, $3, $4, $5, $6, $7)
          ON CONFLICT (student_id, date) WHERE type = 'daily'
          DO UPDATE SET status = EXCLUDED.status, remarks = EXCLUDED.remarks, marked_by = EXCLUDED.marked_by, updated_at = NOW()
          RETURNING *
        `;
        params = [student_id, academic_year_id, date, type, status, remarks || null, userId];
      } else {
        query = `
          INSERT INTO attendance_records (student_id, academic_year_id, date, type, subject_id, status, remarks, marked_by)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
          ON CONFLICT (student_id, date, subject_id) WHERE type = 'subject'
          DO UPDATE SET status = EXCLUDED.status, remarks = EXCLUDED.remarks, marked_by = EXCLUDED.marked_by, updated_at = NOW()
          RETURNING *
        `;
        params = [student_id, academic_year_id, date, type, subject_id, status, remarks || null, userId];
      }

      const result = await client.query(query, params);
      insertedRecords.push(result.rows[0]);
    }

    await createAuditLog({
      userId: userId || '',
      action: 'UPDATE',
      resource: 'attendance',
      resourceId: class_id,
      oldValue: null,
      newValue: { count: records.length, date, type },
      ipAddress: req.ip
    });

    await client.query('COMMIT');

    res.status(200).json({
      success: true,
      message: 'Attendance marked successfully',
      data: { records: insertedRecords }
    });
  } catch (error: any) {
    await client.query('ROLLBACK');
    res.status(500).json({ success: false, message: 'Server error', data: { error: error.message } });
  } finally {
    client.release();
  }
};

export const getClassAttendance = async (req: Request, res: Response) => {
  try {
    const { classId } = req.params;
    const { date, type = 'daily', subject_id } = req.query;

    if (!date) {
      return res.status(400).json({ success: false, message: 'Date is required' });
    }

    let query = `
      SELECT a.id, s.id as student_id, s.roll_number, u.name as student_name, a.status, a.remarks
      FROM students s
      JOIN users u ON s.user_id = u.id
      LEFT JOIN attendance_records a ON s.id = a.student_id AND a.date = $2 AND a.type = $3
    `;
    
    const queryParams: any[] = [classId, date, type];

    if (type === 'subject' && subject_id) {
      query += ` AND a.subject_id = $4`;
      queryParams.push(subject_id);
    }
    
    query += ` WHERE s.current_class_id = $1 AND s.status = 'active' ORDER BY s.roll_number ASC NULLS LAST, u.name ASC`;

    const result = await pool.query(query, queryParams);

    res.status(200).json({
      success: true,
      data: { attendance: result.rows }
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: 'Server error', data: { error: error.message } });
  }
};

export const getStudentAttendance = async (req: Request, res: Response) => {
  try {
    const { studentId } = req.params;
    const { start_date, end_date, type = 'daily' } = req.query;

    const queryParams: any[] = [studentId, type];
    let query = `
      SELECT date, status, remarks, subject_id, marked_by
      FROM attendance_records
      WHERE student_id = $1 AND type = $2
    `;

    if (start_date) {
      queryParams.push(start_date);
      query += ` AND date >= $${queryParams.length}`;
    }
    if (end_date) {
      queryParams.push(end_date);
      query += ` AND date <= $${queryParams.length}`;
    }
    
    query += ` ORDER BY date DESC`;

    const result = await pool.query(query, queryParams);

    res.status(200).json({
      success: true,
      data: { attendance: result.rows }
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: 'Server error', data: { error: error.message } });
  }
};
