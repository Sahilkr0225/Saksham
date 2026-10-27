import { Request, Response } from 'express';
import pool from '../config/db';
import { createAuditLog } from '../utils/audit';
import { createNotification, broadcastRoleNotification } from '../utils/notification';

/**
 * GET /api/v1/notifications
 * Fetch notifications for current authenticated user with pagination and optional filters
 */
export const getNotifications = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).user?.userId;
    if (!userId) {
      res.status(401).json({ success: false, message: 'Authentication required' });
      return;
    }

    const { unread_only, type } = req.query as { unread_only?: string; type?: string };
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit as string) || 20));
    const offset = (page - 1) * limit;

    const conditions: string[] = ['user_id = $1'];
    const params: any[] = [userId];
    let paramIdx = 2;

    if (unread_only === 'true') {
      conditions.push(`is_read = FALSE`);
    }

    if (type) {
      conditions.push(`type = $${paramIdx}`);
      params.push(type);
      paramIdx++;
    }

    const whereClause = conditions.join(' AND ');

    // 1. Get total matching count and total unread count
    const countQuery = `
      SELECT 
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE is_read = FALSE)::int AS unread_count
      FROM notifications
      WHERE user_id = $1
    `;
    const countResult = await pool.query(countQuery, [userId]);
    const totalCount = countResult.rows[0]?.total || 0;
    const unreadCount = countResult.rows[0]?.unread_count || 0;

    // 2. Query paginated notifications
    const dataQuery = `
      SELECT 
        id,
        title,
        message,
        type,
        link,
        is_read,
        read_at,
        metadata,
        created_at
      FROM notifications
      WHERE ${whereClause}
      ORDER BY created_at DESC
      LIMIT $${paramIdx} OFFSET $${paramIdx + 1}
    `;
    params.push(limit, offset);

    const result = await pool.query(dataQuery, params);

    res.status(200).json({
      success: true,
      data: result.rows,
      pagination: {
        total: totalCount,
        unread_count: unreadCount,
        page,
        limit,
        total_pages: Math.ceil(totalCount / limit) || 1
      }
    });
  } catch (error: any) {
    console.error('Error fetching notifications:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch notifications' });
  }
};

/**
 * GET /api/v1/notifications/unread-count
 * Fast query for topbar badge
 */
export const getUnreadCount = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).user?.userId;
    if (!userId) {
      res.status(401).json({ success: false, message: 'Authentication required' });
      return;
    }

    const result = await pool.query(
      `SELECT COUNT(*)::int AS unread_count FROM notifications WHERE user_id = $1 AND is_read = FALSE`,
      [userId]
    );

    res.status(200).json({
      success: true,
      data: {
        unread_count: result.rows[0]?.unread_count || 0
      }
    });
  } catch (error: any) {
    console.error('Error fetching unread count:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch unread notification count' });
  }
};

/**
 * PATCH /api/v1/notifications/:id/read
 * Mark a single notification as read (must belong to authenticated user)
 */
export const markAsRead = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).user?.userId;
    const { id } = req.params;

    const result = await pool.query(
      `UPDATE notifications
       SET is_read = TRUE, read_at = NOW()
       WHERE id = $1 AND user_id = $2
       RETURNING id, is_read, read_at`,
      [id, userId]
    );

    if (result.rowCount === 0) {
      res.status(404).json({
        success: false,
        message: 'Notification not found or access denied'
      });
      return;
    }

    res.status(200).json({
      success: true,
      message: 'Notification marked as read',
      data: result.rows[0]
    });
  } catch (error: any) {
    console.error('Error marking notification as read:', error);
    res.status(500).json({ success: false, message: 'Failed to mark notification as read' });
  }
};

/**
 * PATCH /api/v1/notifications/mark-all-read
 * Mark all notifications as read for current user
 */
export const markAllAsRead = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).user?.userId;

    const result = await pool.query(
      `UPDATE notifications
       SET is_read = TRUE, read_at = NOW()
       WHERE user_id = $1 AND is_read = FALSE
       RETURNING id`,
      [userId]
    );

    res.status(200).json({
      success: true,
      message: 'All notifications marked as read',
      data: {
        updated_count: result.rowCount ?? 0
      }
    });
  } catch (error: any) {
    console.error('Error marking all notifications as read:', error);
    res.status(500).json({ success: false, message: 'Failed to mark all notifications as read' });
  }
};

/**
 * DELETE /api/v1/notifications/:id
 * Delete a notification (must belong to authenticated user)
 */
export const deleteNotification = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).user?.userId;
    const { id } = req.params;

    const result = await pool.query(
      `DELETE FROM notifications
       WHERE id = $1 AND user_id = $2
       RETURNING id`,
      [id, userId]
    );

    if (result.rowCount === 0) {
      res.status(404).json({
        success: false,
        message: 'Notification not found or access denied'
      });
      return;
    }

    res.status(200).json({
      success: true,
      message: 'Notification deleted successfully'
    });
  } catch (error: any) {
    console.error('Error deleting notification:', error);
    res.status(500).json({ success: false, message: 'Failed to delete notification' });
  }
};

/**
 * POST /api/v1/notifications
 * Administrative dispatch of a notification to a specific user or role
 */
export const createManualNotification = async (req: Request, res: Response): Promise<void> => {
  try {
    const senderId = (req as any).user?.userId;
    const { userId, role, title, message, type = 'system', link, metadata } = req.body;

    let dispatchedCount = 0;

    if (role) {
      dispatchedCount = await broadcastRoleNotification(role, {
        title,
        message,
        type,
        link,
        metadata: { ...metadata, sent_by: senderId }
      });
    } else if (userId) {
      const createdId = await createNotification({
        userId,
        title,
        message,
        type,
        link,
        metadata: { ...metadata, sent_by: senderId }
      });
      dispatchedCount = createdId ? 1 : 0;
    }

    await createAuditLog({
      userId: senderId,
      action: 'NOTIFICATION_DISPATCH',
      resource: 'notifications',
      newValue: { target: role ? `role:${role}` : `user:${userId}`, title, type, dispatchedCount },
      ipAddress: req.ip,
      userAgent: req.get('user-agent')
    });

    res.status(201).json({
      success: true,
      message: `Notification dispatched successfully (${dispatchedCount} recipient(s))`,
      data: { dispatched_count: dispatchedCount }
    });
  } catch (error: any) {
    console.error('Error dispatching notification:', error);
    res.status(500).json({ success: false, message: 'Failed to dispatch notification' });
  }
};
