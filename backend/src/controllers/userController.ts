import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import pool from '../config/db';
import { hashPassword } from '../utils/auth';
import { createAuditLog } from '../utils/audit';

/**
 * POST /api/v1/users
 * Create a new user (Invite-Only flow by Super Admin or Principal)
 */
export const createUser = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  const client = await pool.connect();
  try {
    const { name, email, phone, role, avatar_url } = req.body;
    const adminUserId = (req as any).user?.userId;
    const ipAddress = req.ip || req.socket.remoteAddress || null;
    const userAgent = req.headers['user-agent'] || null;

    // 1. Check if email already exists
    const existingUser = await client.query('SELECT id FROM users WHERE email = $1', [email.toLowerCase().trim()]);
    if ((existingUser.rowCount ?? 0) > 0) {
      res.status(409).json({ 
        success: false, 
        message: 'A user account with this email address already exists' 
      });
      return;
    }

    // 2. Fetch role ID
    const roleResult = await client.query('SELECT id FROM roles WHERE name = $1', [role]);
    if (roleResult.rowCount === 0) {
      res.status(400).json({ success: false, message: `Invalid role '${role}' specified` });
      return;
    }
    const roleId = roleResult.rows[0].id;

    // 3. Generate a temporary random password (e.g. Temp@<8 random hex chars>)
    const tempPassword = `Temp@${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
    const passwordHash = await hashPassword(tempPassword);

    await client.query('BEGIN');

    // 4. Insert User
    const insertUserQuery = `
      INSERT INTO users (name, email, password_hash, phone, avatar_url, is_active, must_change_password)
      VALUES ($1, $2, $3, $4, $5, TRUE, TRUE)
      RETURNING id, name, email, phone, avatar_url, is_active, must_change_password, created_at
    `;
    const userResult = await client.query(insertUserQuery, [
      name.trim(),
      email.toLowerCase().trim(),
      passwordHash,
      phone || null,
      avatar_url || null
    ]);
    const newUser = userResult.rows[0];

    // 5. Assign Role
    await client.query(`
      INSERT INTO user_roles (user_id, role_id, assigned_by, is_active)
      VALUES ($1, $2, $3, TRUE)
    `, [newUser.id, roleId, adminUserId]);

    await client.query('COMMIT');

    // 6. Audit Log entry
    await createAuditLog({
      userId: adminUserId,
      action: 'CREATE',
      resource: 'users',
      resourceId: newUser.id,
      newValue: { id: newUser.id, name: newUser.name, email: newUser.email, role },
      ipAddress,
      userAgent
    });

    res.status(201).json({
      success: true,
      message: 'User created successfully. Provide the temporary password to the user.',
      data: {
        user: {
          ...newUser,
          role
        },
        temporary_password: tempPassword
      }
    });

  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally {
    client.release();
  }
};

/**
 * GET /api/v1/users
 * Fetch paginated list of users with optional filtering
 */
export const getUsers = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 10));
    const offset = (page - 1) * limit;

    const roleFilter = req.query.role as string;
    const searchFilter = req.query.search as string;
    const isActiveFilter = req.query.is_active;

    const conditions: string[] = ['u.deleted_at IS NULL'];
    const params: any[] = [];
    let paramIndex = 1;

    if (roleFilter) {
      conditions.push(`r.name = $${paramIndex++}`);
      params.push(roleFilter);
    }

    if (searchFilter) {
      conditions.push(`(u.name ILIKE $${paramIndex} OR u.email ILIKE $${paramIndex})`);
      params.push(`%${searchFilter.trim()}%`);
      paramIndex++;
    }

    if (isActiveFilter !== undefined) {
      conditions.push(`u.is_active = $${paramIndex++}`);
      params.push(isActiveFilter === 'true');
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // Data Query
    const dataQuery = `
      SELECT u.id, u.name, u.email, u.phone, u.avatar_url, u.is_active, u.must_change_password, u.last_login_at, u.created_at, r.name as role
      FROM users u
      LEFT JOIN user_roles ur ON u.id = ur.user_id AND ur.is_active = true
      LEFT JOIN roles r ON ur.role_id = r.id
      ${whereClause}
      ORDER BY u.created_at DESC
      LIMIT $${paramIndex++} OFFSET $${paramIndex++}
    `;

    // Count Query
    const countQuery = `
      SELECT COUNT(DISTINCT u.id) as total
      FROM users u
      LEFT JOIN user_roles ur ON u.id = ur.user_id AND ur.is_active = true
      LEFT JOIN roles r ON ur.role_id = r.id
      ${whereClause}
    `;

    const dataParams = [...params, limit, offset];
    const [dataResult, countResult] = await Promise.all([
      pool.query(dataQuery, dataParams),
      pool.query(countQuery, params)
    ]);

    const total = parseInt(countResult.rows[0].total) || 0;
    const totalPages = Math.ceil(total / limit);

    res.status(200).json({
      success: true,
      message: 'Users fetched successfully',
      data: {
        users: dataResult.rows,
        pagination: {
          page,
          limit,
          total,
          total_pages: totalPages
        }
      }
    });

  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/v1/users/:id
 * Get single user profile by ID
 */
export const getUserById = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { id } = req.params;

    const query = `
      SELECT u.id, u.name, u.email, u.phone, u.avatar_url, u.is_active, u.must_change_password, u.last_login_at, u.created_at, u.updated_at, r.name as role
      FROM users u
      LEFT JOIN user_roles ur ON u.id = ur.user_id AND ur.is_active = true
      LEFT JOIN roles r ON ur.role_id = r.id
      WHERE u.id = $1 AND u.deleted_at IS NULL
    `;

    const result = await pool.query(query, [id]);

    if (result.rowCount === 0) {
      res.status(404).json({ success: false, message: 'User not found' });
      return;
    }

    res.status(200).json({
      success: true,
      message: 'User details fetched successfully',
      data: {
        user: result.rows[0]
      }
    });

  } catch (error) {
    next(error);
  }
};

/**
 * PATCH /api/v1/users/:id
 * Update user details
 */
export const updateUser = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { id } = req.params;
    const { name, phone, avatar_url, is_active } = req.body;
    const adminUserId = (req as any).user?.userId;
    const ipAddress = req.ip || req.socket.remoteAddress || null;
    const userAgent = req.headers['user-agent'] || null;

    // Fetch existing user data
    const existing = await pool.query('SELECT * FROM users WHERE id = $1 AND deleted_at IS NULL', [id]);
    if (existing.rowCount === 0) {
      res.status(404).json({ success: false, message: 'User not found' });
      return;
    }

    const oldUser = existing.rows[0];

    const updates: string[] = ['updated_at = NOW()'];
    const params: any[] = [];
    let paramIndex = 1;

    if (name !== undefined) {
      updates.push(`name = $${paramIndex++}`);
      params.push(name.trim());
    }
    if (phone !== undefined) {
      updates.push(`phone = $${paramIndex++}`);
      params.push(phone);
    }
    if (avatar_url !== undefined) {
      updates.push(`avatar_url = $${paramIndex++}`);
      params.push(avatar_url);
    }
    if (is_active !== undefined) {
      updates.push(`is_active = $${paramIndex++}`);
      params.push(is_active);
    }

    params.push(id);
    const updateQuery = `
      UPDATE users
      SET ${updates.join(', ')}
      WHERE id = $${paramIndex}
      RETURNING id, name, email, phone, avatar_url, is_active, updated_at
    `;

    const result = await pool.query(updateQuery, params);
    const updatedUser = result.rows[0];

    // Audit log
    await createAuditLog({
      userId: adminUserId,
      action: 'UPDATE',
      resource: 'users',
      resourceId: id,
      oldValue: { name: oldUser.name, phone: oldUser.phone, avatar_url: oldUser.avatar_url, is_active: oldUser.is_active },
      newValue: { name: updatedUser.name, phone: updatedUser.phone, avatar_url: updatedUser.avatar_url, is_active: updatedUser.is_active },
      ipAddress,
      userAgent
    });

    res.status(200).json({
      success: true,
      message: 'User updated successfully',
      data: {
        user: updatedUser
      }
    });

  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/v1/users/:id/deactivate
 * Deactivate user account and revoke active sessions
 */
export const deactivateUser = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  const client = await pool.connect();
  try {
    const { id } = req.params;
    const adminUserId = (req as any).user?.userId;
    const ipAddress = req.ip || req.socket.remoteAddress || null;
    const userAgent = req.headers['user-agent'] || null;

    if (id === adminUserId) {
      res.status(400).json({ success: false, message: 'You cannot deactivate your own account' });
      return;
    }

    await client.query('BEGIN');

    // 1. Deactivate user
    const updateResult = await client.query(
      'UPDATE users SET is_active = FALSE, updated_at = NOW() WHERE id = $1 AND deleted_at IS NULL RETURNING id, name, email',
      [id]
    );

    if (updateResult.rowCount === 0) {
      await client.query('ROLLBACK');
      res.status(404).json({ success: false, message: 'User not found' });
      return;
    }

    // 2. Revoke all refresh sessions
    await client.query('UPDATE refresh_tokens SET is_revoked = TRUE WHERE user_id = $1', [id]);

    await client.query('COMMIT');

    // Audit Log
    await createAuditLog({
      userId: adminUserId,
      action: 'DEACTIVATE',
      resource: 'users',
      resourceId: id,
      newValue: { is_active: false },
      ipAddress,
      userAgent
    });

    res.status(200).json({
      success: true,
      message: `User account '${updateResult.rows[0].email}' deactivated successfully`
    });

  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally {
    client.release();
  }
};

/**
 * POST /api/v1/users/:id/reactivate
 * Reactivate a deactivated user account
 */
export const reactivateUser = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { id } = req.params;
    const adminUserId = (req as any).user?.userId;
    const ipAddress = req.ip || req.socket.remoteAddress || null;
    const userAgent = req.headers['user-agent'] || null;

    const result = await pool.query(
      'UPDATE users SET is_active = TRUE, updated_at = NOW() WHERE id = $1 AND deleted_at IS NULL RETURNING id, name, email',
      [id]
    );

    if (result.rowCount === 0) {
      res.status(404).json({ success: false, message: 'User not found' });
      return;
    }

    // Audit log
    await createAuditLog({
      userId: adminUserId,
      action: 'REACTIVATE',
      resource: 'users',
      resourceId: id,
      newValue: { is_active: true },
      ipAddress,
      userAgent
    });

    res.status(200).json({
      success: true,
      message: `User account '${result.rows[0].email}' reactivated successfully`
    });

  } catch (error) {
    next(error);
  }
};
