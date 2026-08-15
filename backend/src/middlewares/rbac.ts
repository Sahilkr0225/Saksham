import { Request, Response, NextFunction } from 'express';
import pool from '../config/db';

/**
 * Middleware to restrict access based on user roles
 * Example usage: router.get('/admin-only', authenticate, authorize('super_admin', 'principal'), controller)
 */
export const authorize = (...allowedRoles: string[]) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    const userRole = (req as any).user?.role;

    if (!userRole) {
      res.status(401).json({
        success: false,
        message: 'Unauthorized: No active authentication session'
      });
      return;
    }

    if (!allowedRoles.includes(userRole)) {
      res.status(403).json({
        success: false,
        message: `Forbidden: Requires one of the following roles: [${allowedRoles.join(', ')}]`
      });
      return;
    }

    next();
  };
};

/**
 * Middleware to restrict access based on specific resource-action permission
 * Example usage: router.post('/students', authenticate, hasPermission('student', 'create'), controller)
 */
export const hasPermission = (resource: string, action: string) => {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userRole = (req as any).user?.role;

      if (!userRole) {
        res.status(401).json({
          success: false,
          message: 'Unauthorized: No active authentication session'
        });
        return;
      }

      // Super Admin bypasses all permission checks
      if (userRole === 'super_admin') {
        next();
        return;
      }

      // Check if role has the requested resource + action permission in DB
      const query = `
        SELECT 1 
        FROM role_permissions rp
        JOIN roles r ON rp.role_id = r.id
        JOIN permissions p ON rp.permission_id = p.id
        WHERE r.name = $1 AND p.resource = $2 AND p.action = $3
        LIMIT 1
      `;

      const result = await pool.query(query, [userRole, resource, action]);

      if (result.rowCount === 0) {
        res.status(403).json({
          success: false,
          message: `Forbidden: You do not have permission to ${action} ${resource}`
        });
        return;
      }

      next();
    } catch (error) {
      next(error);
    }
  };
};
