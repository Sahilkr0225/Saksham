import { Request, Response } from 'express';
import pool from '../config/db';
import { createAuditLog } from '../utils/audit';

export const getTeachers = async (req: Request, res: Response) => {
  try {
    const { search = '', page = 1, limit = 10 } = req.query;
    
    let query = `
      SELECT u.id, u.name, u.email, u.phone, u.avatar_url, u.is_active, u.created_at,
             t.employee_id, t.specialization, t.qualification, t.joining_date
      FROM users u
      JOIN user_roles ur ON u.id = ur.user_id
      JOIN roles r ON ur.role_id = r.id
      LEFT JOIN teachers t ON u.id = t.user_id
      WHERE r.name = 'teacher' AND ur.is_active = true
    `;
    const queryParams: any[] = [];
    
    if (search) {
      queryParams.push(`%${search}%`);
      query += ` AND (u.name ILIKE $${queryParams.length} OR u.email ILIKE $${queryParams.length})`;
    }
    
    const countResult = await pool.query(`SELECT COUNT(*) FROM (${query}) AS count_query`, queryParams);
    const total = parseInt(countResult.rows[0].count);
    
    queryParams.push(limit);
    const limitIdx = queryParams.length;
    
    const offset = (Number(page) - 1) * Number(limit);
    queryParams.push(offset);
    const offsetIdx = queryParams.length;
    
    query += ` ORDER BY u.name ASC LIMIT $${limitIdx} OFFSET $${offsetIdx}`;
    
    const result = await pool.query(query, queryParams);
    
    res.status(200).json({
      success: true,
      message: 'Teachers retrieved successfully',
      data: {
        teachers: result.rows,
        pagination: {
          total,
          page: Number(page),
          limit: Number(limit),
          pages: Math.ceil(total / Number(limit))
        }
      }
    });

  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error', data: { error } });
  }
};

export const getTeacherById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userRole = (req as any).user?.role;
    const userId = (req as any).user?.userId;
    
    if (userRole === 'teacher' && userId !== id) {
      return res.status(403).json({ success: false, message: 'Access denied: You can only view your own profile' });
    }
    
    const result = await pool.query(`
      SELECT u.id, u.name, u.email, u.phone, u.avatar_url, u.is_active, u.created_at,
             t.employee_id, t.specialization, t.qualification, t.joining_date, t.address, t.emergency_contact
      FROM users u
      JOIN user_roles ur ON u.id = ur.user_id
      JOIN roles r ON ur.role_id = r.id
      LEFT JOIN teachers t ON u.id = t.user_id
      WHERE r.name = 'teacher' AND ur.is_active = true AND u.id = $1
    `, [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Teacher not found' });
    }
    
    res.status(200).json({
      success: true,
      message: 'Teacher profile retrieved successfully',
      data: { teacher: result.rows[0] }
    });

  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error', data: { error } });
  }
};

export const getMyProfile = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.userId;
    const userRole = (req as any).user?.role;
    
    if (userRole !== 'teacher') {
      return res.status(403).json({ success: false, message: 'Only teachers can access this endpoint' });
    }

    const result = await pool.query(`
      SELECT u.id, u.name, u.email, u.phone, u.avatar_url, u.is_active, u.created_at,
             t.employee_id, t.specialization, t.qualification, t.joining_date, t.address, t.emergency_contact
      FROM users u
      LEFT JOIN teachers t ON u.id = t.user_id
      WHERE u.id = $1
    `, [userId]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Profile not found' });
    }
    
    res.status(200).json({
      success: true,
      message: 'Self profile retrieved successfully',
      data: { teacher: result.rows[0] }
    });

  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error', data: { error } });
  }
};

export const updateTeacher = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { employee_id, specialization, qualification, joining_date, address, emergency_contact } = req.body;
    const adminUserId = (req as any).user?.userId;

    // Check if teacher user exists
    const userResult = await pool.query(`
      SELECT u.id FROM users u
      JOIN user_roles ur ON u.id = ur.user_id
      JOIN roles r ON ur.role_id = r.id
      WHERE r.name = 'teacher' AND ur.is_active = true AND u.id = $1
    `, [id]);
    
    if (userResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Teacher user not found' });
    }

    // Upsert into teachers table
    const existingProfile = await pool.query(`SELECT * FROM teachers WHERE user_id = $1`, [id]);
    let query = '';
    let params: any[] = [];
    let oldValue = {};

    if (existingProfile.rows.length === 0) {
      query = `
        INSERT INTO teachers (user_id, employee_id, specialization, qualification, joining_date, address, emergency_contact)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING *
      `;
      params = [id, employee_id || null, specialization || null, qualification || null, joining_date || null, address || null, emergency_contact || null];
    } else {
      oldValue = existingProfile.rows[0];
      query = `
        UPDATE teachers 
        SET employee_id = COALESCE($2, employee_id),
            specialization = COALESCE($3, specialization),
            qualification = COALESCE($4, qualification),
            joining_date = COALESCE($5, joining_date),
            address = COALESCE($6, address),
            emergency_contact = COALESCE($7, emergency_contact),
            updated_at = NOW()
        WHERE user_id = $1
        RETURNING *
      `;
      params = [
        id, 
        employee_id !== undefined ? employee_id : oldValue['employee_id' as keyof typeof oldValue], 
        specialization !== undefined ? specialization : oldValue['specialization' as keyof typeof oldValue], 
        qualification !== undefined ? qualification : oldValue['qualification' as keyof typeof oldValue], 
        joining_date !== undefined ? joining_date : oldValue['joining_date' as keyof typeof oldValue], 
        address !== undefined ? address : oldValue['address' as keyof typeof oldValue], 
        emergency_contact !== undefined ? emergency_contact : oldValue['emergency_contact' as keyof typeof oldValue]
      ];
    }

    const updatedProfile = await pool.query(query, params);

    await createAuditLog({
      userId: adminUserId || '',
      action: existingProfile.rows.length === 0 ? 'CREATE' : 'UPDATE',
      resource: 'teachers',
      resourceId: id,
      oldValue,
      newValue: updatedProfile.rows[0],
      ipAddress: req.ip
    });

    res.status(200).json({
      success: true,
      message: 'Teacher profile updated successfully',
      data: { teacher_profile: updatedProfile.rows[0] }
    });

  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error', data: { error } });
  }
};

export const getTeacherSubjects = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userRole = (req as any).user?.role;
    const userId = (req as any).user?.userId;
    
    if (userRole === 'teacher' && userId !== id) {
      return res.status(403).json({ success: false, message: 'Access denied to this profile' });
    }

    // Verify teacher exists
    const userResult = await pool.query(`
      SELECT u.id FROM users u
      JOIN user_roles ur ON u.id = ur.user_id
      JOIN roles r ON ur.role_id = r.id
      WHERE r.name = 'teacher' AND ur.is_active = true AND u.id = $1
    `, [id]);
    
    if (userResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Teacher user not found' });
    }

    const subjectsQuery = `
      SELECT cs.id as mapping_id, c.name as class_name, c.code as class_code,
             s.name as subject_name, s.code as subject_code, s.type as subject_type,
             ay.name as academic_year
      FROM class_subjects cs
      JOIN classes c ON cs.class_id = c.id
      JOIN subjects s ON cs.subject_id = s.id
      JOIN academic_years ay ON cs.academic_year_id = ay.id
      WHERE cs.teacher_id = $1
      ORDER BY ay.start_date DESC, c.display_order ASC
    `;
    
    const result = await pool.query(subjectsQuery, [id]);

    res.status(200).json({
      success: true,
      message: 'Teacher subjects retrieved successfully',
      data: { assignments: result.rows }
    });

  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error', data: { error } });
  }
};
