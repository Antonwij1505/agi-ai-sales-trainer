import { Router } from 'express';

import { HttpError } from '../middleware/error.middleware.js';
import { requireAuth } from '../middleware/auth.middleware.js';
import { sessionLimiter } from '../middleware/rateLimit.middleware.js';
import {
  assertCanRetry,
  compareAttempts,
  getHistory,
  getProgress,
  recomputeProgress,
} from '../services/progress.service.js';
import { createSession, loadScenarioContext } from '../services/session.service.js';
import { openingTurn } from '../services/roleplay.service.js';

export const progressRouter = Router();

/** Resolve the sales id a request is allowed to inspect. */
function resolveSalesId(req: { user?: { sub: number; role: string } }, param?: string): number {
  const me = req.user!;
  // Sales may only ever see their own data; spv/manager/admin may target anyone.
  if (me.role === 'sales') {
    if (param && Number(param) !== me.sub) {
      throw new HttpError(403, 'Tidak boleh mengakses data sales lain.');
    }
    return me.sub;
  }
  if (param) {
    const n = Number(param);
    if (!Number.isInteger(n) || n <= 0) throw new HttpError(400, 'sales_id tidak valid.');
    return n;
  }
  return me.sub;
}

/** GET /api/trainer/progress — rolled-up per-module progress. */
progressRouter.get('/progress', requireAuth, async (req, res, next) => {
  try {
    const salesId = resolveSalesId(req, req.query.sales_id as string | undefined);
    res.json({ success: true, sales_id: salesId, progress: await getProgress(salesId) });
  } catch (err) {
    next(err);
  }
});

/** GET /api/trainer/history — every attempt, newest first. */
progressRouter.get('/history', requireAuth, async (req, res, next) => {
  try {
    const salesId = resolveSalesId(req, req.query.sales_id as string | undefined);
    const moduleIdRaw = req.query.module_id as string | undefined;
    const moduleId = moduleIdRaw ? Number(moduleIdRaw) : undefined;
    if (moduleIdRaw && (!Number.isInteger(moduleId) || (moduleId as number) <= 0)) {
      throw new HttpError(400, 'module_id tidak valid.');
    }
    const history = await getHistory(salesId, moduleId);
    res.json({ success: true, sales_id: salesId, count: history.length, history });
  } catch (err) {
    next(err);
  }
});

/** GET /api/trainer/progress/:moduleId/compare — attempt comparison. */
progressRouter.get('/progress/:moduleId/compare', requireAuth, async (req, res, next) => {
  try {
    const salesId = resolveSalesId(req, req.query.sales_id as string | undefined);
    const moduleId = Number(req.params.moduleId);
    if (!Number.isInteger(moduleId) || moduleId <= 0) {
      throw new HttpError(400, 'module_id tidak valid.');
    }
    res.json({ success: true, comparison: await compareAttempts(salesId, moduleId) });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/trainer/progress/:moduleId/recompute
 * Rebuild the rollup from source evaluations (idempotent, admin/self).
 */
progressRouter.post('/progress/:moduleId/recompute', requireAuth, async (req, res, next) => {
  try {
    const salesId = resolveSalesId(req, req.query.sales_id as string | undefined);
    const moduleId = Number(req.params.moduleId);
    if (!Number.isInteger(moduleId) || moduleId <= 0) {
      throw new HttpError(400, 'module_id tidak valid.');
    }
    const progress = await recomputeProgress(salesId, moduleId);
    res.json({ success: true, progress: progress ?? null });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/trainer/scenarios/:scenarioId/retry
 * Start a retry attempt, respecting the module's max_attempt.
 */
progressRouter.post('/scenarios/:scenarioId/retry', requireAuth, sessionLimiter, async (req, res, next) => {
  try {
    const salesId = req.user!.sub;
    const scenarioId = Number(req.params.scenarioId);
    if (!Number.isInteger(scenarioId) || scenarioId <= 0) {
      throw new HttpError(400, 'scenario_id tidak valid.');
    }

    await assertCanRetry(salesId, scenarioId);

    const scenario = await loadScenarioContext(scenarioId);
    const session = await createSession({ salesId, scenarioId, mode: 'practice' });
    const resistance = scenario.resistance_level ?? scenario.persona_default_resistance ?? 3;
    const opening = await openingTurn(session.id, scenario, resistance);

    res.status(201).json({ success: true, session, opening, retry_of_module: scenario.module_code });
  } catch (err) {
    next(err);
  }
});
