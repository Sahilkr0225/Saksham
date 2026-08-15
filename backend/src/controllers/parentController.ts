import { Request, Response } from 'express';
import pool from '../config/db';
import { createAuditLog } from '../utils/audit';

export const getParents = async (req: Request, res: Response) => {
  try {
    const { search = '', page = 1, limit = 10 } = req.query;
    
    let query = `
      SELECT id, name, email, phone, avatar_url, is_active, created_at 
      FROM users 
      WHERE is_active = true 
      AND id IN (
        SELECT user_id FROM user_roles 
        JOIN roles ON user_roles.role_id = roles.id 
        WHERE roles.name = 'parent' AND user_roles.is_active = true
      )
    `;
    const queryParams: any[] = [];
    
    if (search) {
      queryParams.push(`%${search}%`);
      query += ` AND (name ILIKE $${queryParams.length} OR email ILIKE $${queryParams.length})`;
    }
    
    const countResult = await pool.query(`SELECT COUNT(*) FROM (${query}) AS count_query`, queryParams);
    const total = parseInt(countResult.rows[0].count);
    
    queryParams.push(limit);
    const limitIdx = queryParams.length;
    
    const offset = (Number(page) - 1) * Number(limit);
    queryParams.push(offset);
    const offsetIdx = queryParams.length;
    
    query += ` ORDER BY name ASC LIMIT $${limitIdx} OFFSET $${offsetIdx}`;
    
    const result = await pool.query(query, queryParams);
    
    res.status(200).json({
      success: true,
      message: 'Parents retrieved successfully',
      data: {
        parents: result.rows,
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

export const getParentById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userRole = (req as any).user?.role;
    const userId = (req as any).user?.userId;
    
    // RBAC logic: A parent can only view their own profile.
    if (userRole === 'parent' && userId !== id) {
      return res.status(403).json({ success: false, message: 'Access denied to this profile' });
    }
    
    const parentResult = await pool.query(`
      SELECT id, name, email, phone, avatar_url, is_active, created_at 
      FROM users 
      WHERE id = $1 AND id IN (
        SELECT user_id FROM user_roles 
        JOIN roles ON user_roles.role_id = roles.id 
        WHERE roles.name = 'parent' AND user_roles.is_active = true
      )
    `, [id]);
    
    if (parentResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Parent not found' });
    }
    
    const childrenResult = await pool.query(`
      SELECT s.id as student_id, s.admission_number, s.roll_number, s.status,
             u.name, u.email, u.avatar_url,
             c.name as class_name, sec.name as section_name
      FROM students s
      JOIN users u ON s.user_id = u.id
      LEFT JOIN classes c ON s.current_class_id = c.id
      LEFT JOIN sections sec ON s.current_section_id = sec.id
      WHERE s.parent_user_id = $1
    `, [id]);
    
    const parentInfo = parentResult.rows[0];
    parentInfo.children = childrenResult.rows;
    
    res.status(200).json({
      success: true,
      message: 'Parent profile retrieved successfully',
      data: parentInfo
    });

  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error', data: { error } });
  }
};

export const getMyChildren = async (req: Request, res: Response) => {
  try {
    const parentId = (req as any).user?.userId;
    
    if ((req as any).user?.role !== 'parent') {
      return res.status(403).json({ success: false, message: 'Only parents can access this endpoint' });
    }

    const childrenResult = await pool.query(`
      SELECT s.id as student_id, s.admission_number, s.roll_number, s.status, s.dob, s.blood_group,
             u.name, u.email, u.phone, u.avatar_url,
             c.name as class_name, sec.name as section_name
      FROM students s
      JOIN users u ON s.user_id = u.id
      LEFT JOIN classes c ON s.current_class_id = c.id
      LEFT JOIN sections sec ON s.current_section_id = sec.id
      WHERE s.parent_user_id = $1
    `, [parentId]);
    
    res.status(200).json({
      success: true,
      message: 'Children retrieved successfully',
      data: childrenResult.rows
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error', data: { error } });
  }
};

export const linkStudent = async (req: Request, res: Response) => {
  try {
    const parentId = req.params.id;
    const { student_id } = req.body;
    
    // Verify parent exists and is actually a parent
    const parentCheck = await pool.query(`
      SELECT id FROM users 
      WHERE id = $1 AND id IN (
        SELECT user_id FROM user_roles 
        JOIN roles ON user_roles.role_id = roles.id 
        WHERE roles.name = 'parent' AND user_roles.is_active = true
      )
    `, [parentId]);
    
    if (parentCheck.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Parent user not found' });
    }
    
    // Check if student exists
    const studentCheck = await pool.query(`SELECT parent_user_id FROM students WHERE id = $1`, [student_id]);
    
    if (studentCheck.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Student not found' });
    }
    
    const oldParentId = studentCheck.rows[0].parent_user_id;

    await pool.query(
      `UPDATE students SET parent_user_id = $1, updated_at = NOW() WHERE id = $2`,
      [parentId, student_id]
    );

    await createAuditLog({
      userId: (req as any).user?.userId || '',
      action: 'UPDATE',
      resource: 'students',
      resourceId: student_id,
      oldValue: { parent_user_id: oldParentId },
      newValue: { parent_user_id: parentId },
      ipAddress: req.ip
    });

    res.status(200).json({
      success: true,
      message: 'Student linked to parent successfully',
      data: { student_id, parent_id: parentId }
    });

  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error', data: { error } });
  }
};

export const unlinkStudent = async (req: Request, res: Response) => {
  try {
    const parentId = req.params.id;
    const { student_id } = req.body;
    
    // Check if student exists and is linked to this parent
    const studentCheck = await pool.query(
      `SELECT parent_user_id FROM students WHERE id = $1 AND parent_user_id = $2`, 
      [student_id, parentId]
    );
    
    if (studentCheck.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Student is not linked to this parent' });
    }
    
    await pool.query(
      `UPDATE students SET parent_user_id = NULL, updated_at = NOW() WHERE id = $1`,
      [student_id]
    );

    await createAuditLog({
      userId: (req as any).user?.userId || '',
      action: 'UPDATE',
      resource: 'students',
      resourceId: student_id,
      oldValue: { parent_user_id: parentId },
      newValue: { parent_user_id: null },
      ipAddress: req.ip
    });

    res.status(200).json({
      success: true,
      message: 'Student unlinked from parent successfully',
      data: { student_id, old_parent_id: parentId }
    });

  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error', data: { error } });
  }
};
