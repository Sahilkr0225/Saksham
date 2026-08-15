import pool from '../config/db';

export interface AuditLogParams {
  userId?: string | null;
  action: string;
  resource: string;
  resourceId?: string | null;
  oldValue?: Record<string, any> | null;
  newValue?: Record<string, any> | null;
  ipAddress?: string | null;
  userAgent?: string | null;
}

/**
 * Creates an immutable record in the audit_logs database table.
 * Failures in audit logging are logged to console but do not crash request handlers.
 */
export const createAuditLog = async (params: AuditLogParams): Promise<void> => {
  try {
    const {
      userId = null,
      action,
      resource,
      resourceId = null,
      oldValue = null,
      newValue = null,
      ipAddress = null,
      userAgent = null
    } = params;

    const query = `
      INSERT INTO audit_logs (user_id, action, resource, resource_id, old_value, new_value, ip_address, user_agent)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    `;

    await pool.query(query, [
      userId,
      action,
      resource,
      resourceId,
      oldValue ? JSON.stringify(oldValue) : null,
      newValue ? JSON.stringify(newValue) : null,
      ipAddress,
      userAgent
    ]);
  } catch (error) {
    console.error('Failed to write audit log entry:', error);
  }
};
