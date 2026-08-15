import { Request, Response, NextFunction } from 'express';
import pool from '../config/db';
import { createAuditLog } from '../utils/audit';

// ─── Academic Years ───────────────────────────────────────────────────────────

export const createAcademicYear = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  const client = await pool.connect();
  try {
    const { name, start_date, end_date, is_current } = req.body;
    const userId = (req as any).user?.userId;

    await client.query('BEGIN');

    if (is_current) {
      await client.query('UPDATE academic_years SET is_current = FALSE');
    }

    const query = `
      INSERT INTO academic_years (name, start_date, end_date, is_current)
      VALUES ($1, $2, $3, $4)
      RETURNING *
    `;
    const result = await client.query(query, [name, start_date, end_date, is_current || false]);
    await client.query('COMMIT');

    await createAuditLog({
      userId,
      action: 'CREATE',
      resource: 'academic_years',
      resourceId: result.rows[0].id,
      newValue: result.rows[0]
    });

    res.status(201).json({
      success: true,
      message: 'Academic year created successfully',
      data: { academic_year: result.rows[0] }
    });
  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally {
    client.release();
  }
};

export const getAcademicYears = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const result = await pool.query('SELECT * FROM academic_years ORDER BY start_date DESC');
    res.status(200).json({
      success: true,
      message: 'Academic years fetched successfully',
      data: { academic_years: result.rows }
    });
  } catch (error) {
    next(error);
  }
};

export const setCurrentAcademicYear = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  const client = await pool.connect();
  try {
    const { id } = req.params;
    const userId = (req as any).user?.userId;

    await client.query('BEGIN');
    await client.query('UPDATE academic_years SET is_current = FALSE');
    const result = await client.query(
      'UPDATE academic_years SET is_current = TRUE, updated_at = NOW() WHERE id = $1 RETURNING *',
      [id]
    );

    if (result.rowCount === 0) {
      await client.query('ROLLBACK');
      res.status(404).json({ success: false, message: 'Academic year not found' });
      return;
    }

    await client.query('COMMIT');

    await createAuditLog({
      userId,
      action: 'UPDATE',
      resource: 'academic_years',
      resourceId: id,
      newValue: { is_current: true }
    });

    res.status(200).json({
      success: true,
      message: `'${result.rows[0].name}' set as active academic year`,
      data: { academic_year: result.rows[0] }
    });
  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally {
    client.release();
  }
};

// ─── Classes & Sections ───────────────────────────────────────────────────────

export const createClass = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { name, code, display_order } = req.body;
    const userId = (req as any).user?.userId;

    const query = `
      INSERT INTO classes (name, code, display_order)
      VALUES ($1, $2, $3)
      RETURNING *
    `;
    const result = await pool.query(query, [name.trim(), code ? code.trim() : null, display_order || 0]);

    await createAuditLog({
      userId,
      action: 'CREATE',
      resource: 'classes',
      resourceId: result.rows[0].id,
      newValue: result.rows[0]
    });

    res.status(201).json({
      success: true,
      message: 'Class created successfully',
      data: { class: result.rows[0] }
    });
  } catch (error) {
    next(error);
  }
};

export const getClasses = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const query = `
      SELECT c.*, 
             COALESCE(
               json_agg(
                 json_build_object(
                   'id', s.id,
                   'name', s.name,
                   'capacity', s.capacity,
                   'room_number', s.room_number
                 )
               ) FILTER (WHERE s.id IS NOT NULL), '[]'
             ) as sections
      FROM classes c
      LEFT JOIN sections s ON c.id = s.class_id
      GROUP BY c.id
      ORDER BY c.display_order ASC, c.name ASC
    `;
    const result = await pool.query(query);

    res.status(200).json({
      success: true,
      message: 'Classes fetched successfully',
      data: { classes: result.rows }
    });
  } catch (error) {
    next(error);
  }
};

export const createSection = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { class_id, name, capacity, room_number } = req.body;
    const userId = (req as any).user?.userId;

    const classCheck = await pool.query('SELECT id FROM classes WHERE id = $1', [class_id]);
    if (classCheck.rowCount === 0) {
      res.status(404).json({ success: false, message: 'Specified class does not exist' });
      return;
    }

    const query = `
      INSERT INTO sections (class_id, name, capacity, room_number)
      VALUES ($1, $2, $3, $4)
      RETURNING *
    `;
    const result = await pool.query(query, [class_id, name.trim(), capacity || 40, room_number || null]);

    await createAuditLog({
      userId,
      action: 'CREATE',
      resource: 'sections',
      resourceId: result.rows[0].id,
      newValue: result.rows[0]
    });

    res.status(201).json({
      success: true,
      message: 'Section created successfully',
      data: { section: result.rows[0] }
    });
  } catch (error) {
    next(error);
  }
};

// ─── Subjects & Subject Allocations ──────────────────────────────────────────

export const createSubject = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { name, code, type } = req.body;
    const userId = (req as any).user?.userId;

    const query = `
      INSERT INTO subjects (name, code, type)
      VALUES ($1, $2, $3)
      RETURNING *
    `;
    const result = await pool.query(query, [name.trim(), code.toUpperCase().trim(), type || 'core']);

    await createAuditLog({
      userId,
      action: 'CREATE',
      resource: 'subjects',
      resourceId: result.rows[0].id,
      newValue: result.rows[0]
    });

    res.status(201).json({
      success: true,
      message: 'Subject created successfully',
      data: { subject: result.rows[0] }
    });
  } catch (error) {
    next(error);
  }
};

export const getSubjects = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const result = await pool.query('SELECT * FROM subjects ORDER BY name ASC');
    res.status(200).json({
      success: true,
      message: 'Subjects fetched successfully',
      data: { subjects: result.rows }
    });
  } catch (error) {
    next(error);
  }
};

export const assignSubjectToClass = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { class_id, subject_id, academic_year_id, teacher_id } = req.body;
    const userId = (req as any).user?.userId;

    const query = `
      INSERT INTO class_subjects (class_id, subject_id, academic_year_id, teacher_id)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (class_id, subject_id, academic_year_id) 
      DO UPDATE SET teacher_id = EXCLUDED.teacher_id, updated_at = NOW()
      RETURNING *
    `;
    const result = await pool.query(query, [class_id, subject_id, academic_year_id, teacher_id || null]);

    await createAuditLog({
      userId,
      action: 'ASSIGN_SUBJECT',
      resource: 'class_subjects',
      resourceId: result.rows[0].id,
      newValue: result.rows[0]
    });

    res.status(200).json({
      success: true,
      message: 'Subject allocated to class successfully',
      data: { allocation: result.rows[0] }
    });
  } catch (error) {
    next(error);
  }
};

export const getClassSubjects = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { classId } = req.params;
    const { academic_year_id } = req.query;

    let whereClause = 'WHERE cs.class_id = $1';
    const params: any[] = [classId];

    if (academic_year_id) {
      whereClause += ' AND cs.academic_year_id = $2';
      params.push(academic_year_id);
    }

    const query = `
      SELECT cs.id, cs.class_id, cs.academic_year_id, 
             s.id as subject_id, s.name as subject_name, s.code as subject_code, s.type as subject_type,
             u.id as teacher_id, u.name as teacher_name, u.email as teacher_email
      FROM class_subjects cs
      JOIN subjects s ON cs.subject_id = s.id
      LEFT JOIN users u ON cs.teacher_id = u.id
      ${whereClause}
      ORDER BY s.name ASC
    `;

    const result = await pool.query(query, params);

    res.status(200).json({
      success: true,
      message: 'Class subjects fetched successfully',
      data: { class_subjects: result.rows }
    });
  } catch (error) {
    next(error);
  }
};
