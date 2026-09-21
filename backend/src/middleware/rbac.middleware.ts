import type { Request, Response, NextFunction } from 'express';
import { pool } from '../db/pool.js';
import { HttpError } from './error.middleware.js';

/**
 * RBAC permission verification middleware.
 * Checks if the authenticated user's role has the required permission code.
 * Super Admin (role === 'admin' or role === 'super_admin') bypasses all permission checks.
 */
export function requirePermission(permissionCode: string) {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    if (!req.user) {
      return next(new HttpError(401, 'Unauthorized — authentication required'));
    }

    const role = req.user.role;
    if (role === 'admin' || role === 'super_admin') {
      return next();
    }

    try {
      const { rows } = await pool.query(
        `SELECT 1 FROM trainer_role_permissions rp
         JOIN trainer_roles r ON r.id = rp.role_id
         JOIN trainer_permissions p ON p.id = rp.permission_id
         WHERE r.name = $1 AND p.code = $2`,
        [role, permissionCode]
      );

      if (rows.length === 0) {
        return next(new HttpError(403, `Forbidden — insufficient permissions (${permissionCode} required)`));
      }

      next();
    } catch (err) {
      next(err);
    }
  };
}

/**
 * Require one of the specified roles.
 */
export function requireRole(allowedRoles: string[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      return next(new HttpError(401, 'Unauthorized — authentication required'));
    }

    const role = req.user.role;
    if (role === 'admin' || allowedRoles.includes(role)) {
      return next();
    }

    return next(new HttpError(403, `Forbidden — role '${role}' not authorized`));
  };
}
