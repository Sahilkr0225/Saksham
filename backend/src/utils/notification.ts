import pool from '../config/db';

export interface CreateNotificationParams {
  userId: string;
  title: string;
  message: string;
  type?: 'system' | 'notice' | 'fee' | 'attendance' | 'homework' | 'exam' | 'admission' | 'document';
  link?: string | null;
  metadata?: Record<string, any> | null;
}

export interface BroadcastNotificationParams {
  userIds: string[];
  title: string;
  message: string;
  type?: 'system' | 'notice' | 'fee' | 'attendance' | 'homework' | 'exam' | 'admission' | 'document';
  link?: string | null;
  metadata?: Record<string, any> | null;
}

/**
 * Creates an in-app notification for a specific user.
 * Silently catches errors to ensure it doesn't interrupt core transactions.
 */
export const createNotification = async (params: CreateNotificationParams): Promise<string | null> => {
  try {
    const {
      userId,
      title,
      message,
      type = 'system',
      link = null,
      metadata = null
    } = params;

    const query = `
      INSERT INTO notifications (user_id, title, message, type, link, metadata)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING id
    `;

    const result = await pool.query(query, [
      userId,
      title,
      message,
      type,
      link,
      metadata ? JSON.stringify(metadata) : null
    ]);

    return result.rows[0]?.id || null;
  } catch (error) {
    console.error('Failed to create notification:', error);
    return null;
  }
};

/**
 * Broadcasts an in-app notification to multiple users efficiently.
 */
export const broadcastNotification = async (params: BroadcastNotificationParams): Promise<number> => {
  try {
    const { userIds, title, message, type = 'system', link = null, metadata = null } = params;
    if (!userIds || userIds.length === 0) return 0;

    // Remove duplicates
    const uniqueIds = Array.from(new Set(userIds));
    const metadataJson = metadata ? JSON.stringify(metadata) : null;

    // Batch insert using unnest
    const query = `
      INSERT INTO notifications (user_id, title, message, type, link, metadata)
      SELECT u_id, $2, $3, $4, $5, $6
      FROM unnest($1::uuid[]) AS u_id
    `;

    const result = await pool.query(query, [uniqueIds, title, message, type, link, metadataJson]);
    return result.rowCount ?? 0;
  } catch (error) {
    console.error('Failed to broadcast notifications:', error);
    return 0;
  }
};

/**
 * Broadcasts a notification to all active users with a specific role.
 */
export const broadcastRoleNotification = async (
  roleName: string,
  params: Omit<CreateNotificationParams, 'userId'>
): Promise<number> => {
  try {
    const usersResult = await pool.query(
      `SELECT u.id 
       FROM users u
       JOIN user_roles ur ON u.id = ur.user_id
       JOIN roles r ON ur.role_id = r.id
       WHERE r.name = $1 AND u.is_active = TRUE AND ur.is_active = TRUE`,
      [roleName]
    );

    const userIds = usersResult.rows.map((row) => row.id);
    if (userIds.length === 0) return 0;

    return await broadcastNotification({
      userIds,
      ...params
    });
  } catch (error) {
    console.error(`Failed to broadcast role notifications for role ${roleName}:`, error);
    return 0;
  }
};
