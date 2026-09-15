import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

import { env } from '../config/env.js';
import { HttpError } from './error.middleware.js';

/**
 * JWT payload contract — identical to Sales Analytics so a token issued by the
 * analytics backend is accepted here without a second login.
 */
export interface AuthJwtPayload {
  sub: number;
  username: string;
  role: 'admin' | 'sales' | 'spv' | 'manager';
  nama_lengkap: string;
  provinsi_list?: string[];
  kabkota_list?: string[];
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthJwtPayload;
    }
  }
}

/** Verify the bearer JWT and attach `req.user`. */
export function requireAuth(req: Request, _res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return next(new HttpError(401, 'Unauthorized — missing or invalid token'));
  }
  try {
    const payload = jwt.verify(header.slice(7), env.JWT_SECRET) as unknown as AuthJwtPayload;
    req.user = payload;
    next();
  } catch {
    return next(new HttpError(401, 'Unauthorized — token expired or invalid'));
  }
}

/** Must run after `requireAuth`. Rejects anyone who is not an admin. */
export function requireAdmin(req: Request, _res: Response, next: NextFunction): void {
  if (!req.user || req.user.role !== 'admin') {
    return next(new HttpError(403, 'Forbidden — admin role required'));
  }
  next();
}

/**
 * System-to-system auth for the Sales Analytics contract (§80–§83).
 * Accepts either a shared API key header or a valid admin JWT.
 */
export function requireSystemOrAdmin(req: Request, _res: Response, next: NextFunction): void {
  const apiKey = req.headers['x-api-key'];
  if (env.TRAINER_API_KEY && typeof apiKey === 'string' && apiKey === env.TRAINER_API_KEY) {
    return next();
  }
  return requireAuth(req, _res, (err?: unknown) => {
    if (err) return next(err);
    return requireAdmin(req, _res, next);
  });
}
