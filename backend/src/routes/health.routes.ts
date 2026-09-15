import { Router } from 'express';

import { query } from '../db/pool.js';
import { requireAuth } from '../middleware/auth.middleware.js';

export const healthRouter = Router();

/** Liveness — no DB touch, for container health checks. */
healthRouter.get('/', (_req, res) => {
  res.json({ status: 'ok', service: 'agi-trainer-backend', time: new Date().toISOString() });
});

/** Readiness — verifies the trainer schema is actually present. */
healthRouter.get('/ready', async (_req, res, next) => {
  try {
    const { rows } = await query<{ n: string }>(
      `SELECT count(*)::text AS n
         FROM information_schema.tables
        WHERE table_name LIKE 'trainer_%'`,
    );
    const tables = Number(rows[0]?.n ?? 0);
    res.status(tables > 0 ? 200 : 503).json({
      status: tables > 0 ? 'ready' : 'schema_missing',
      trainer_tables: tables,
    });
  } catch (err) {
    next(err);
  }
});

/** Authenticated identity echo — proves the shared JWT contract works. */
healthRouter.get('/whoami', requireAuth, (req, res) => {
  res.json({ user: req.user });
});
