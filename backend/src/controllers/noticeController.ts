import { Request, Response } from 'express';
import pool from '../config/db';
import { createAuditLog } from '../utils/audit';
import { broadcastRoleNotification } from '../utils/notification';

// ─── Helpers ─────────────────────────────────────────────────────────────────

const getAuthorizedClassIds = async (userId: string, role: string): Promise<string[]> => {
  let classIds: string[] = [];
  if (role === 'student') {
    const studentCheck = await pool.query(
      `SELECT current_class_id FROM students WHERE user_id = $1 AND status = 'active' AND current_class_id IS NOT NULL`,
      [userId]
    );
    classIds = studentCheck.rows.map((r: any) => r.current_class_id).filter(Boolean);
  } else if (role === 'parent') {
    const parentCheck = await pool.query(
      `SELECT current_class_id FROM students WHERE parent_user_id = $1 AND status = 'active' AND current_class_id IS NOT NULL`,
      [userId]
    );
    classIds = parentCheck.rows.map((r: any) => r.current_class_id).filter(Boolean);
  }
  return classIds;
};

// ─── Notices ─────────────────────────────────────────────────────────────────

export const createNotice = async (req: Request, res: Response) => {
  try {
    const { title, content, type, priority, target_audience, target_role, target_class_id, academic_year_id, published } = req.body;
    const userId = (req as any).user?.userId;
    const userRole = ((req as any).user?.role || '').toLowerCase();

    // Only super_admin and principal may set high priority (pinned)
    const requestedPriority = priority || 'normal';
    if (requestedPriority === 'high' && !['super_admin', 'principal'].includes(userRole)) {
      return res.status(403).json({
        success: false,
        message: 'Forbidden: Only super_admin and principal can set priority to high'
      });
    }

    const publishedAt = published ? new Date() : null;

    const result = await pool.query(`
      INSERT INTO notices (title, content, type, priority, target_audience, target_role, target_class_id, academic_year_id, published, published_at, created_by)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING *
    `, [title, content, type || 'general', requestedPriority, target_audience || 'all', target_role || null, target_class_id || null, academic_year_id || null, published || false, publishedAt, userId]);

    await createAuditLog({ userId, action: 'CREATE', resource: 'notices', resourceId: result.rows[0].id, oldValue: null, newValue: result.rows[0], ipAddress: req.ip });

    // Trigger in-app notification if notice is immediately published
    if (result.rows[0].published) {
      if (target_audience === 'role' && target_role) {
        broadcastRoleNotification(target_role, {
          title: `New Circular: ${title}`,
          message: content.length > 120 ? content.substring(0, 117) + '...' : content,
          type: 'notice',
          link: '/notices'
        });
      }
    }

    res.status(201).json({ success: true, message: 'Notice created successfully', data: { notice: result.rows[0] } });
  } catch (error: any) {
    res.status(500).json({ success: false, message: 'Server error', data: { error: error.message } });
  }
};

export const getAllNotices = async (req: Request, res: Response) => {
  try {
    const { type, target_audience, status, search, limit = 50, offset = 0 } = req.query;
    
    let query = `
      SELECT n.*, u.name as author_name, c.name as class_name 
      FROM notices n
      LEFT JOIN users u ON n.created_by = u.id
      LEFT JOIN classes c ON n.target_class_id = c.id
      WHERE n.deleted_at IS NULL
    `;
    const params: any[] = [];
    let paramIndex = 1;

    if (type) {
      query += ` AND n.type = $${paramIndex++}`;
      params.push(type);
    }
    if (target_audience) {
      query += ` AND n.target_audience = $${paramIndex++}`;
      params.push(target_audience);
    }
    if (status === 'published') {
      query += ` AND n.published = TRUE`;
    } else if (status === 'draft') {
      query += ` AND n.published = FALSE`;
    }
    if (search) {
      query += ` AND (n.title ILIKE $${paramIndex} OR n.content ILIKE $${paramIndex})`;
      params.push(`%${search}%`);
      paramIndex++;
    }

    // High priority (pinned) stuff first, then by latest publish date / creation date
    query += ` ORDER BY CASE WHEN n.priority = 'high' THEN 1 ELSE 2 END ASC, COALESCE(n.published_at, n.created_at) DESC LIMIT $${paramIndex++} OFFSET $${paramIndex++}`;
    params.push(limit, offset);

    const result = await pool.query(query, params);
    res.status(200).json({ success: true, data: { notices: result.rows } });
  } catch (error: any) {
    res.status(500).json({ success: false, message: 'Server error', data: { error: error.message } });
  }
};

export const getMyNotices = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.userId;
    const userRole = ((req as any).user?.role || '').toLowerCase();

    // To serve student/parent, find their relevant classes
    const classIds = await getAuthorizedClassIds(userId, userRole);

    const paramArray: any[] = [userRole || ''];
    let query = `
      SELECT n.*, u.name as author_name, c.name as class_name 
      FROM notices n
      LEFT JOIN users u ON n.created_by = u.id
      LEFT JOIN classes c ON n.target_class_id = c.id
      WHERE n.deleted_at IS NULL AND n.published = TRUE
      AND (
        n.target_audience = 'all' 
        OR (n.target_audience = 'role' AND n.target_role = $1)
    `;

    if (classIds.length > 0) {
      query += ` OR (n.target_audience = 'class' AND n.target_class_id = ANY($2::uuid[]))`;
      paramArray.push(classIds);
    }
    query += `)`;

    query += ` ORDER BY CASE WHEN n.priority = 'high' THEN 1 ELSE 2 END ASC, n.published_at DESC LIMIT 50`;

    const result = await pool.query(query, paramArray);
    res.status(200).json({ success: true, data: { notices: result.rows } });
  } catch (error: any) {
    console.error("GET_MY_NOTICES_ERROR:", error);
    res.status(500).json({ success: false, message: 'Server error', data: { error: error.message } });
  }
};

export const getNoticeById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userId = (req as any).user?.userId;
    const userRole = ((req as any).user?.role || '').toLowerCase();

    const result = await pool.query(`
      SELECT n.*, u.name as author_name, c.name as class_name 
      FROM notices n
      LEFT JOIN users u ON n.created_by = u.id
      LEFT JOIN classes c ON n.target_class_id = c.id
      WHERE n.id = $1 AND n.deleted_at IS NULL
    `, [id]);

    if (result.rows.length === 0) return res.status(404).json({ success: false, message: 'Notice not found' });
    const notice = result.rows[0];

    // Administrative / staff access check
    const isStaff = ['super_admin', 'principal', 'office_staff', 'teacher'].includes(userRole);
    if (!isStaff) {
      // Students and parents:
      // 1. Unpublished notices are never accessible
      if (!notice.published) {
        return res.status(404).json({ success: false, message: 'Notice not found' });
      }

      // 2. Audience authorization check
      if (notice.target_audience === 'all') {
        // School-wide: accessible
      } else if (notice.target_audience === 'role') {
        if (notice.target_role !== userRole) {
          return res.status(404).json({ success: false, message: 'Notice not found' });
        }
      } else if (notice.target_audience === 'class') {
        const classIds = await getAuthorizedClassIds(userId, userRole);
        if (!notice.target_class_id || !classIds.includes(notice.target_class_id)) {
          return res.status(404).json({ success: false, message: 'Notice not found' });
        }
      } else {
        return res.status(404).json({ success: false, message: 'Notice not found' });
      }
    }

    res.status(200).json({ success: true, data: { notice } });
  } catch (error: any) {
    res.status(500).json({ success: false, message: 'Server error', data: { error: error.message } });
  }
};

export const updateNotice = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const updates = req.body;
    const userId = (req as any).user?.userId;
    const userRole = ((req as any).user?.role || '').toLowerCase();

    const existing = await pool.query(`SELECT * FROM notices WHERE id = $1 AND deleted_at IS NULL`, [id]);
    if (existing.rows.length === 0) return res.status(404).json({ success: false, message: 'Notice not found' });

    // Enforce ownership: Teachers can only edit notices they created
    if (userRole === 'teacher' && existing.rows[0].created_by !== userId) {
      return res.status(403).json({
        success: false,
        message: 'Forbidden: Teachers can only edit notices they created'
      });
    }

    // Only super_admin and principal may set priority to 'high'
    if (updates.priority === 'high' && !['super_admin', 'principal'].includes(userRole)) {
      return res.status(403).json({
        success: false,
        message: 'Forbidden: Only super_admin and principal can set priority to high'
      });
    }

    // Handle dynamic update
    const allowedFields = ['title', 'content', 'type', 'priority', 'target_audience', 'target_role', 'target_class_id', 'published'];
    const setCols: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    for (const [key, value] of Object.entries(updates)) {
      if (allowedFields.includes(key)) {
        setCols.push(`${key} = $${paramIndex++}`);
        values.push(value);
      }
    }

    // Special handling for published_at (when flipped to true)
    if (updates.published === true && !existing.rows[0].published) {
      setCols.push(`published_at = $${paramIndex++}`);
      values.push(new Date());
    }

    if (setCols.length === 0) return res.status(400).json({ success: false, message: 'No valid fields provided for update' });

    setCols.push(`updated_at = NOW()`);
    values.push(id);

    const query = `UPDATE notices SET ${setCols.join(', ')} WHERE id = $${paramIndex} RETURNING *`;
    const result = await pool.query(query, values);

    await createAuditLog({ userId, action: 'UPDATE', resource: 'notices', resourceId: id, oldValue: existing.rows[0], newValue: result.rows[0], ipAddress: req.ip });

    res.status(200).json({ success: true, message: 'Notice updated successfully', data: { notice: result.rows[0] } });
  } catch (error: any) {
    res.status(500).json({ success: false, message: 'Server error', data: { error: error.message } });
  }
};

export const pinNotice = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userId = (req as any).user?.userId;
    const { action } = req.body; // 'pin' or 'unpin'

    const existing = await pool.query(`SELECT priority FROM notices WHERE id = $1 AND deleted_at IS NULL`, [id]);
    if (existing.rows.length === 0) return res.status(404).json({ success: false, message: 'Notice not found' });

    const newPriority = action === 'pin' ? 'high' : 'normal';

    const result = await pool.query(`UPDATE notices SET priority = $1, updated_at = NOW() WHERE id = $2 RETURNING *`, [newPriority, id]);
    await createAuditLog({ userId, action: 'UPDATE', resource: 'notices', resourceId: id, oldValue: existing.rows[0], newValue: result.rows[0], ipAddress: req.ip });

    res.status(200).json({ success: true, message: `Notice ${action}ned successfully`, data: { notice: result.rows[0] } });
  } catch (error: any) {
    res.status(500).json({ success: false, message: 'Server error', data: { error: error.message } });
  }
};

export const deleteNotice = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userId = (req as any).user?.userId;
    const userRole = ((req as any).user?.role || '').toLowerCase();

    const existing = await pool.query(`SELECT * FROM notices WHERE id = $1 AND deleted_at IS NULL`, [id]);
    if (existing.rows.length === 0) return res.status(404).json({ success: false, message: 'Notice not found' });

    // Enforce ownership: Teachers can only delete notices they created
    if (userRole === 'teacher' && existing.rows[0].created_by !== userId) {
      return res.status(403).json({
        success: false,
        message: 'Forbidden: Teachers can only delete notices they created'
      });
    }

    // Soft delete
    const result = await pool.query(`UPDATE notices SET deleted_at = NOW(), updated_at = NOW() WHERE id = $1 RETURNING *`, [id]);
    
    await createAuditLog({ userId, action: 'DELETE', resource: 'notices', resourceId: id, oldValue: existing.rows[0], newValue: { deleted_at: result.rows[0].deleted_at }, ipAddress: req.ip });

    res.status(200).json({ success: true, message: 'Notice deleted successfully' });
  } catch (error: any) {
    res.status(500).json({ success: false, message: 'Server error', data: { error: error.message } });
  }
};

// ─── Events ──────────────────────────────────────────────────────────────────

export const createEvent = async (req: Request, res: Response) => {
  try {
    const { title, description, event_type, start_date, end_date, target_audience, target_class_id, academic_year_id } = req.body;
    const userId = (req as any).user?.userId;

    const result = await pool.query(`
      INSERT INTO events (title, description, event_type, start_date, end_date, target_audience, target_class_id, academic_year_id, created_by)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *
    `, [title, description || null, event_type, start_date, end_date || null, target_audience || 'all', target_class_id || null, academic_year_id || null, userId]);

    await createAuditLog({ userId, action: 'CREATE', resource: 'events', resourceId: result.rows[0].id, oldValue: null, newValue: result.rows[0], ipAddress: req.ip });

    res.status(201).json({ success: true, message: 'Event created successfully', data: { event: result.rows[0] } });
  } catch (error: any) {
    res.status(500).json({ success: false, message: 'Server error', data: { error: error.message } });
  }
};

export const getEvents = async (req: Request, res: Response) => {
  try {
    const { event_type, start_date, end_date, target_class_id } = req.query;
    const userId = (req as any).user?.userId;
    const userRole = ((req as any).user?.role || '').toLowerCase();

    let query = `
      SELECT e.*, c.name as class_name 
      FROM events e
      LEFT JOIN classes c ON e.target_class_id = c.id
      WHERE 1=1
    `;
    const params: any[] = [];
    let paramIndex = 1;

    if (event_type) {
      query += ` AND e.event_type = $${paramIndex++}`;
      params.push(event_type);
    }
    if (start_date && end_date) {
      query += ` AND (e.start_date <= $${paramIndex++} AND (e.end_date IS NULL OR e.end_date >= $${paramIndex++}))`;
      params.push(end_date, start_date);
    }

    const isStaff = ['super_admin', 'principal', 'office_staff', 'teacher'].includes(userRole);
    if (isStaff) {
      if (target_class_id) {
        query += ` AND (e.target_audience = 'all' OR e.target_class_id = $${paramIndex++})`;
        params.push(target_class_id);
      }
    } else {
      // Non-staff: student or parent
      const authorizedClassIds = await getAuthorizedClassIds(userId, userRole);

      if (authorizedClassIds.length > 0) {
        if (target_class_id) {
          // If client specifies target_class_id, only honor if authorized for this user
          if (authorizedClassIds.includes(target_class_id as string)) {
            query += ` AND (e.target_audience = 'all' OR e.target_class_id = $${paramIndex++})`;
            params.push(target_class_id);
          } else {
            // Requested class outside authorized classes: restrict to school-wide events only
            query += ` AND e.target_audience = 'all'`;
          }
        } else {
          query += ` AND (e.target_audience = 'all' OR e.target_class_id = ANY($${paramIndex++}::uuid[]))`;
          params.push(authorizedClassIds);
        }
      } else {
        // No enrolled/guardian-linked class: school-wide events only
        query += ` AND e.target_audience = 'all'`;
      }
    }

    query += ` ORDER BY e.start_date ASC`;

    const result = await pool.query(query, params);
    res.status(200).json({ success: true, data: { events: result.rows } });
  } catch (error: any) {
    res.status(500).json({ success: false, message: 'Server error', data: { error: error.message } });
  }
};

export const getEventById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userId = (req as any).user?.userId;
    const userRole = ((req as any).user?.role || '').toLowerCase();

    const result = await pool.query(`
      SELECT e.*, c.name as class_name 
      FROM events e
      LEFT JOIN classes c ON e.target_class_id = c.id
      WHERE e.id = $1
    `, [id]);

    if (result.rows.length === 0) return res.status(404).json({ success: false, message: 'Event not found' });
    const event = result.rows[0];

    const isStaff = ['super_admin', 'principal', 'office_staff', 'teacher'].includes(userRole);
    if (!isStaff) {
      if (event.target_audience === 'class') {
        const authorizedClassIds = await getAuthorizedClassIds(userId, userRole);
        if (!event.target_class_id || !authorizedClassIds.includes(event.target_class_id)) {
          return res.status(404).json({ success: false, message: 'Event not found' });
        }
      }
    }

    res.status(200).json({ success: true, data: { event } });
  } catch (error: any) {
    res.status(500).json({ success: false, message: 'Server error', data: { error: error.message } });
  }
};

export const updateEvent = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const updates = req.body;
    const userId = (req as any).user?.userId;

    const existing = await pool.query(`SELECT * FROM events WHERE id = $1`, [id]);
    if (existing.rows.length === 0) return res.status(404).json({ success: false, message: 'Event not found' });

    const allowedFields = ['title', 'description', 'event_type', 'start_date', 'end_date', 'target_audience', 'target_class_id'];
    const setCols: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    for (const [key, value] of Object.entries(updates)) {
      if (allowedFields.includes(key)) {
        setCols.push(`${key} = $${paramIndex++}`);
        values.push(value);
      }
    }

    if (setCols.length === 0) return res.status(400).json({ success: false, message: 'No valid fields provided for update' });

    setCols.push(`updated_at = NOW()`);
    values.push(id);

    const result = await pool.query(`UPDATE events SET ${setCols.join(', ')} WHERE id = $${paramIndex} RETURNING *`, values);
    await createAuditLog({ userId, action: 'UPDATE', resource: 'events', resourceId: id, oldValue: existing.rows[0], newValue: result.rows[0], ipAddress: req.ip });

    res.status(200).json({ success: true, message: 'Event updated successfully', data: { event: result.rows[0] } });
  } catch (error: any) {
    res.status(500).json({ success: false, message: 'Server error', data: { error: error.message } });
  }
};

export const deleteEvent = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userId = (req as any).user?.userId;

    const existing = await pool.query(`SELECT * FROM events WHERE id = $1`, [id]);
    if (existing.rows.length === 0) return res.status(404).json({ success: false, message: 'Event not found' });

    await pool.query(`DELETE FROM events WHERE id = $1`, [id]); // Hard delete for events as per design
    await createAuditLog({ userId, action: 'DELETE', resource: 'events', resourceId: id, oldValue: existing.rows[0], newValue: null, ipAddress: req.ip });

    res.status(200).json({ success: true, message: 'Event deleted successfully' });
  } catch (error: any) {
    res.status(500).json({ success: false, message: 'Server error', data: { error: error.message } });
  }
};
