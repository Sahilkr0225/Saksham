import { Request, Response } from 'express';
import pool from '../config/db';
import { createAuditLog } from '../utils/audit';

export const getParents = async (req: Request, res: Response) => {
  try {
    const { search = '', page = 1, limit = 10 } = req.query;
    
    let baseWhere = `r.name = 'parent' AND ur.is_active = true`;
    const queryParams: any[] = [];
    
    if (search) {
      queryParams.push(`%${search}%`);
      baseWhere += ` AND (u.name ILIKE $1 OR u.email ILIKE $1)`;
    }

    // 1. Get filtered total count for pagination
    const countResult = await pool.query(
      `SELECT COUNT(DISTINCT u.id) as total
       FROM users u
       JOIN user_roles ur ON u.id = ur.user_id
       JOIN roles r ON ur.role_id = r.id
       WHERE ${baseWhere}`,
      queryParams
    );
    const total = parseInt(countResult.rows[0].total) || 0;

    // 2. Get dataset-wide global metrics across the entire school
    const metricsResult = await pool.query(`
      SELECT 
        COUNT(DISTINCT u.id)::int as total_parents,
        COUNT(DISTINCT u.id) FILTER (WHERE u.is_active = true)::int as active_parents,
        COUNT(DISTINCT u.id) FILTER (WHERE u.is_active = false)::int as inactive_parents,
        COUNT(DISTINCT s.parent_user_id)::int as parents_with_wards,
        COUNT(s.id)::int as total_linked_students,
        (SELECT COUNT(*)::int FROM students WHERE parent_user_id IS NULL) as unlinked_students
      FROM users u
      JOIN user_roles ur ON u.id = ur.user_id
      JOIN roles r ON ur.role_id = r.id
      LEFT JOIN students s ON s.parent_user_id = u.id
      WHERE r.name = 'parent' AND ur.is_active = true
    `);
    const metricsRow = metricsResult.rows[0] || {};
    const totalParents = metricsRow.total_parents || 0;
    const parentsWithWards = metricsRow.parents_with_wards || 0;

    const counts = {
      total: totalParents,
      active: metricsRow.active_parents || 0,
      inactive: metricsRow.inactive_parents || 0,
      parents_with_wards: parentsWithWards,
      parents_without_wards: Math.max(0, totalParents - parentsWithWards),
      total_linked_students: metricsRow.total_linked_students || 0,
      unlinked_students: metricsRow.unlinked_students || 0
    };

    // 3. Paginated parent records with linked_students_count
    queryParams.push(limit);
    const limitIdx = queryParams.length;
    const offset = (Number(page) - 1) * Number(limit);
    queryParams.push(offset);
    const offsetIdx = queryParams.length;

    const dataQuery = `
      SELECT u.id, u.name, u.email, u.phone, u.avatar_url, u.is_active, u.created_at,
             COUNT(s.id)::int as linked_students_count
      FROM users u
      JOIN user_roles ur ON u.id = ur.user_id 
      JOIN roles r ON ur.role_id = r.id 
      LEFT JOIN students s ON s.parent_user_id = u.id
      WHERE ${baseWhere}
      GROUP BY u.id, u.name, u.email, u.phone, u.avatar_url, u.is_active, u.created_at
      ORDER BY u.name ASC 
      LIMIT $${limitIdx} OFFSET $${offsetIdx}
    `;

    const result = await pool.query(dataQuery, queryParams);

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
        },
        counts
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
  const client = await pool.connect();
  try {
    const parentId = req.params.id;
    const { student_id } = req.body;

    await client.query('BEGIN');

    // 1. Verify parent exists and has the active parent role
    const parentCheck = await client.query(`
      SELECT u.id, u.name, u.is_active 
      FROM users u
      JOIN user_roles ur ON u.id = ur.user_id
      JOIN roles r ON ur.role_id = r.id
      WHERE u.id = $1 AND r.name = 'parent' AND ur.is_active = true
    `, [parentId]);

    if (parentCheck.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, message: 'Parent user not found or does not have an active parent role' });
    }

    // 2. Check student existence and lock row with FOR UPDATE for concurrency safety
    const studentCheck = await client.query(
      `SELECT id, parent_user_id FROM students WHERE id = $1 FOR UPDATE`,
      [student_id]
    );

    if (studentCheck.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, message: 'Student record not found' });
    }

    const currentParentId = studentCheck.rows[0].parent_user_id;

    // 3. Prevent silent overwrites of an existing parent-student association
    if (currentParentId && currentParentId !== parentId) {
      await client.query('ROLLBACK');
      return res.status(409).json({
        success: false,
        message: 'Student is already linked to another parent account. Please unlink them first before reassigning.'
      });
    }

    if (currentParentId === parentId) {
      // Idempotent: already linked to this parent
      await client.query('ROLLBACK');
      return res.status(200).json({
        success: true,
        message: 'Student is already linked to this parent',
        data: { student_id, parent_id: parentId }
      });
    }

    // 4. Update relationship
    await client.query(
      `UPDATE students SET parent_user_id = $1, updated_at = NOW() WHERE id = $2`,
      [parentId, student_id]
    );

    // 5. Create audit log
    await createAuditLog({
      userId: (req as any).user?.userId || '',
      action: 'UPDATE',
      resource: 'students',
      resourceId: student_id,
      oldValue: { parent_user_id: currentParentId },
      newValue: { parent_user_id: parentId },
      ipAddress: req.ip
    });

    await client.query('COMMIT');

    res.status(200).json({
      success: true,
      message: 'Student linked to parent successfully',
      data: { student_id, parent_id: parentId }
    });

  } catch (error) {
    await client.query('ROLLBACK');
    res.status(500).json({ success: false, message: 'Server error', data: { error } });
  } finally {
    client.release();
  }
};

export const unlinkStudent = async (req: Request, res: Response) => {
  const client = await pool.connect();
  try {
    const parentId = req.params.id;
    const { student_id } = req.body;

    await client.query('BEGIN');

    // 1. Lock student row with FOR UPDATE
    const studentCheck = await client.query(
      `SELECT id, parent_user_id FROM students WHERE id = $1 FOR UPDATE`, 
      [student_id]
    );

    if (studentCheck.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, message: 'Student record not found' });
    }

    const currentParentId = studentCheck.rows[0].parent_user_id;

    if (!currentParentId || currentParentId !== parentId) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, message: 'Student is not linked to this parent' });
    }

    // 2. Set parent_user_id to NULL without mutating any other student fields
    await client.query(
      `UPDATE students SET parent_user_id = NULL, updated_at = NOW() WHERE id = $1`,
      [student_id]
    );

    // 3. Create audit log
    await createAuditLog({
      userId: (req as any).user?.userId || '',
      action: 'UPDATE',
      resource: 'students',
      resourceId: student_id,
      oldValue: { parent_user_id: parentId },
      newValue: { parent_user_id: null },
      ipAddress: req.ip
    });

    await client.query('COMMIT');

    res.status(200).json({
      success: true,
      message: 'Student unlinked from parent successfully',
      data: { student_id, old_parent_id: parentId }
    });

  } catch (error) {
    await client.query('ROLLBACK');
    res.status(500).json({ success: false, message: 'Server error', data: { error } });
  } finally {
    client.release();
  }
};
