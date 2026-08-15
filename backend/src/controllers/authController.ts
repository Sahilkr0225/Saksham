import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import pool from '../config/db';
import {
  hashPassword,
  comparePassword,
  generateAccessToken,
  generateRefreshToken,
  verifyRefreshToken
} from '../utils/auth';

// Helper to hash refresh tokens for secure DB storage
const hashToken = (token: string): string => {
  return crypto.createHash('sha256').update(token).digest('hex');
};

/**
 * POST /api/v1/auth/login
 * Public authentication route
 */
export const login = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { email, password, phone } = req.body;

    // 1. Fetch user and their active role from DB
    const userQuery = `
      SELECT u.id, u.name, u.email, u.password_hash, u.is_active, u.must_change_password, r.name as role_name
      FROM users u
      LEFT JOIN user_roles ur ON u.id = ur.user_id AND ur.is_active = true
      LEFT JOIN roles r ON ur.role_id = r.id
      WHERE u.email = $1 AND u.deleted_at IS NULL
    `;
    const userResult = await pool.query(userQuery, [email.toLowerCase().trim()]);

    if (userResult.rowCount === 0) {
      res.status(401).json({ success: false, message: 'Invalid email or password' });
      return;
    }

    const user = userResult.rows[0];

    // 2. Check if user is active
    if (!user.is_active) {
      res.status(403).json({ success: false, message: 'Your account has been deactivated. Please contact support.' });
      return;
    }

    // 3. Verify password
    const isPasswordValid = await comparePassword(password, user.password_hash);
    if (!isPasswordValid) {
      res.status(401).json({ success: false, message: 'Invalid email or password' });
      return;
    }

    // 4. Generate Tokens
    const role = user.role_name || 'student'; // Default fallback role
    const accessToken = generateAccessToken({ userId: user.id, role, name: user.name, email: user.email });
    const refreshToken = generateRefreshToken({ userId: user.id });

    // 5. Store Refresh Token Hash in DB
    const refreshTokenHash = hashToken(refreshToken);
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7); // 7 Days expiry

    const ipAddress = req.ip || req.socket.remoteAddress || null;
    const userAgent = req.headers['user-agent'] || null;

    const insertTokenQuery = `
      INSERT INTO refresh_tokens (user_id, token_hash, ip_address, user_agent, expires_at)
      VALUES ($1, $2, $3, $4, $5)
    `;
    await pool.query(insertTokenQuery, [user.id, refreshTokenHash, ipAddress, userAgent, expiresAt]);

    // 6. Update last login timestamp
    const updateLoginQuery = `UPDATE users SET last_login_at = NOW() WHERE id = $1`;
    await pool.query(updateLoginQuery, [user.id]);

    // 7. Set Refresh Token as HTTP-only cookie
    res.cookie('refresh_token', refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days in ms
    });

    // 8. Respond containing custom payload
    res.status(200).json({
      success: true,
      message: 'Logged in successfully',
      data: {
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          role,
          must_change_password: user.must_change_password
        },
        access_token: accessToken
      }
    });

  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/v1/auth/refresh
 * Token rotation to issue new Access & Refresh tokens
 */
export const refresh = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    // Read refresh token from cookies, fallback to body
    const token = req.cookies?.refresh_token || req.body?.refresh_token;

    if (!token) {
      res.status(400).json({ success: false, message: 'Refresh token is required' });
      return;
    }

    // 1. Verify token signature
    const decoded = verifyRefreshToken(token);
    if (!decoded) {
      res.status(401).json({ success: false, message: 'Invalid or expired refresh token' });
      return;
    }

    // 2. Check token in DB
    const tokenHash = hashToken(token);
    const tokenQuery = `
      SELECT id, user_id, is_revoked, expires_at
      FROM refresh_tokens
      WHERE token_hash = $1
    `;
    const tokenResult = await pool.query(tokenQuery, [tokenHash]);

    if (tokenResult.rowCount === 0) {
      res.status(401).json({ success: false, message: 'Invalid refresh token session' });
      return;
    }

    const session = tokenResult.rows[0];

    // 3. Check revocation or expiry status
    if (session.is_revoked) {
      res.status(401).json({ success: false, message: 'Refresh token has been revoked' });
      return;
    }

    if (new Date(session.expires_at) < new Date()) {
      res.status(401).json({ success: false, message: 'Refresh token session expired' });
      return;
    }

    // 4. Fetch active user details + role
    const userQuery = `
      SELECT u.id, u.name, u.email, u.is_active, r.name as role_name
      FROM users u
      LEFT JOIN user_roles ur ON u.id = ur.user_id AND ur.is_active = true
      LEFT JOIN roles r ON ur.role_id = r.id
      WHERE u.id = $1 AND u.deleted_at IS NULL
    `;
    const userResult = await pool.query(userQuery, [session.user_id]);

    if (userResult.rowCount === 0 || !userResult.rows[0].is_active) {
      res.status(401).json({ success: false, message: 'User account is inactive or deleted' });
      return;
    }

    const user = userResult.rows[0];
    const role = user.role_name || 'student';

    // 5. Generate new pair of tokens (rotation)
    const newAccessToken = generateAccessToken({ userId: user.id, role, name: user.name, email: user.email });
    const newRefreshToken = generateRefreshToken({ userId: user.id });

    // 6. Revoke old token and insert new token in transactions
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Revoke the current token
      await client.query('UPDATE refresh_tokens SET is_revoked = TRUE WHERE id = $1', [session.id]);

      // Add the new token
      const newExpiresAt = new Date();
      newExpiresAt.setDate(newExpiresAt.getDate() + 7);
      const newHash = hashToken(newRefreshToken);
      const ipAddress = req.ip || req.socket.remoteAddress || null;
      const userAgent = req.headers['user-agent'] || null;

      await client.query(`
        INSERT INTO refresh_tokens (user_id, token_hash, ip_address, user_agent, expires_at)
        VALUES ($1, $2, $3, $4, $5)
      `, [user.id, newHash, ipAddress, userAgent, newExpiresAt]);

      await client.query('COMMIT');
    } catch (txError) {
      await client.query('ROLLBACK');
      throw txError;
    } finally {
      client.release();
    }

    // 7. Update Cookie
    res.cookie('refresh_token', newRefreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000
    });

    res.status(200).json({
      success: true,
      message: 'Tokens rotated successfully',
      data: {
        access_token: newAccessToken
      }
    });

  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/v1/auth/logout
 * Destroys current refresh session
 */
export const logout = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const token = req.cookies?.refresh_token || req.body?.refresh_token;

    if (token) {
      const tokenHash = hashToken(token);

      // Revoke in database
      const revokeQuery = `UPDATE refresh_tokens SET is_revoked = TRUE WHERE token_hash = $1`;
      await pool.query(revokeQuery, [tokenHash]);
    }

    // Clear client HTTPOnly cookie
    res.clearCookie('refresh_token', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict'
    });

    res.status(200).json({
      success: true,
      message: 'Logged out successfully'
    });
  } catch (error) {
    next(error);
  }
};

/**
 * PATCH /api/v1/auth/change-password
 * Requires active authentication (userId from request context)
 */
export const changePassword = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    // Current user context (provided by authenticated middleware - written next)
    const userId = (req as any).user?.userId;
    const { current_password, new_password } = req.body;

    if (!userId) {
      res.status(401).json({ success: false, message: 'Unauthorized' });
      return;
    }

    // 1. Fetch user password hash
    const pashResult = await pool.query('SELECT password_hash FROM users WHERE id = $1 AND deleted_at IS NULL', [userId]);
    if (pashResult.rowCount === 0) {
      res.status(404).json({ success: false, message: 'User not found' });
      return;
    }

    const { password_hash } = pashResult.rows[0];

    // 2. Validate current password
    const isMatched = await comparePassword(current_password, password_hash);
    if (!isMatched) {
      res.status(400).json({ success: false, message: 'Incorrect current password' });
      return;
    }

    // 3. Hash & Update password to new one
    const newHash = await hashPassword(new_password);
    const updatePassQuery = `
      UPDATE users 
      SET password_hash = $1, must_change_password = FALSE, updated_at = NOW() 
      WHERE id = $2
    `;
    await pool.query(updatePassQuery, [newHash, userId]);

    // 4. Revoke all active refresh sessions for this user (for security logout on password change)
    await pool.query('UPDATE refresh_tokens SET is_revoked = TRUE WHERE user_id = $1', [userId]);

    // Clear current cookie
    res.clearCookie('refresh_token', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict'
    });

    res.status(200).json({
      success: true,
      message: 'Password changed successfully. Please log in again with your new credentials.'
    });

  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/v1/auth/me
 * Returns profile details of the authenticated caller
 */
export const me = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const userId = (req as any).user?.userId;

    if (!userId) {
      res.status(401).json({ success: false, message: 'Unauthorized' });
      return;
    }

    const userQuery = `
      SELECT u.id, u.name, u.email, u.phone, u.avatar_url, u.is_active, r.name as role_name
      FROM users u
      LEFT JOIN user_roles ur ON u.id = ur.user_id AND ur.is_active = true
      LEFT JOIN roles r ON ur.role_id = r.id
      WHERE u.id = $1 AND u.deleted_at IS NULL
    `;
    const result = await pool.query(userQuery, [userId]);

    if (result.rowCount === 0) {
      res.status(404).json({ success: false, message: 'User not found' });
      return;
    }

    res.status(200).json({
      success: true,
      message: 'Profile details fetched successfully',
      data: {
        user: result.rows[0]
      }
    });

  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/v1/auth/forgot-password
 * Triggers OTP generation. In development, we return token or output to console
 */
export const forgotPassword = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { email } = req.body;

    // Check if user exists
    const userCheck = await pool.query('SELECT id, name FROM users WHERE email = $1 AND deleted_at IS NULL', [email.toLowerCase().trim()]);

    if (userCheck.rowCount === 0) {
      // Return success anyway, to prevent user-enumeration attacks!
      res.status(200).json({
        success: true,
        message: 'If the email matches an active account, password reset instructions have been sent.'
      });
      return;
    }

    // Build simulated OTP (e.g. 123456 or randomly generated)
    const otp = '123456';
    console.log(`🔑 DEVELOPMENT PASSWORD RESET OTP FOR ${email}: ${otp}`);

    // In a real application, we would save the OTP in database (e.g. users.reset_otp or a reset_requests table)
    // with an expiry, and send email via mock/real transporter.
    // For now we'll support verification of '123456' as our dev bypass code.

    res.status(200).json({
      success: true,
      message: 'If the email matches an active account, password reset instructions have been sent.'
    });

  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/v1/auth/reset-password
 * Consumes verification OTP and writes newly configured password
 */
export const resetPassword = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { email, otp, new_password } = req.body;

    // Dev bypass test: verify OTP is '123456'
    if (otp !== '123456') {
      res.status(400).json({ success: false, message: 'Invalid or expired OTP' });
      return;
    }

    // 1. Fetch user
    const userQuery = await pool.query('SELECT id FROM users WHERE email = $1 AND deleted_at IS NULL', [email.toLowerCase().trim()]);
    if (userQuery.rowCount === 0) {
      res.status(400).json({ success: false, message: 'Invalid request' });
      return;
    }

    const userId = userQuery.rows[0].id;

    // 2. Hash and update password
    const newHash = await hashPassword(new_password);
    await pool.query('UPDATE users SET password_hash = $1, must_change_password = FALSE, updated_at = NOW() WHERE id = $2', [newHash, userId]);

    // 3. Clear sessions
    await pool.query('UPDATE refresh_tokens SET is_revoked = TRUE WHERE user_id = $1', [userId]);

    res.status(200).json({
      success: true,
      message: 'Password reset successfully. Please log in using your new password.'
    });

  } catch (error) {
    next(error);
  }
};
