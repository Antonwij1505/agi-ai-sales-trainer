import { Router } from 'express';

import { HttpError } from '../middleware/error.middleware.js';
import { requireAdmin, requireAuth, requireSystemOrAdmin } from '../middleware/auth.middleware.js';
import {
  assignmentInput,
  buildResultPayload,
  enqueueResult,
  flushOutbox,
  listAssignments,
  pendingResults,
  upsertAssignment,
} from '../services/integration.service.js';

/**
 * Sales Analytics integration (Stage 11, PRD §80–§83).
 *
 * INBOUND  — analytics posts a training need. Authenticated with the shared
 *            system API key OR an admin JWT, because the caller is a service.
 * OUTBOUND — the result outbox is drained by the worker; these routes expose the
 *            queue state and a manual flush for operators.
 */
export const integrationRouter = Router();

/**
 * POST /api/trainer/integrations/assignments
 * Body: assignmentInput (external_ref is the idempotency key)
 * Auth: X-API-KEY (system) or admin JWT
 */
integrationRouter.post(
  '/integrations/assignments',
  requireSystemOrAdmin,
  async (req, res, next) => {
    try {
      const parsed = assignmentInput.safeParse(req.body);
      if (!parsed.success) {
        throw new HttpError(400, 'Body tidak valid', parsed.error.flatten().fieldErrors);
      }
      const result = await upsertAssignment(parsed.data);
      // 200 on replay, 201 on first creation — the caller can tell them apart.
      res.status(result.created ? 201 : 200).json({ success: true, ...result });
    } catch (err) {
      next(err);
    }
  },
);

/** GET /api/trainer/assignments — my assignments (or another sales' for admin/spv). */
integrationRouter.get('/assignments', requireAuth, async (req, res, next) => {
  try {
    const me = req.user!;
    let salesId = me.sub;
    const q = req.query.sales_id as string | undefined;
    if (q) {
      if (me.role === 'sales' && Number(q) !== me.sub) {
        throw new HttpError(403, 'Tidak boleh mengakses assignment sales lain.');
      }
      const n = Number(q);
      if (!Number.isInteger(n) || n <= 0) throw new HttpError(400, 'sales_id tidak valid.');
      salesId = n;
    }
    res.json({ success: true, sales_id: salesId, assignments: await listAssignments(salesId) });
  } catch (err) {
    next(err);
  }
});

/** GET /api/trainer/admin/outbox — queue state (admin). */
integrationRouter.get('/integrations/outbox', requireAuth, requireAdmin, async (_req, res, next) => {
  try {
    const pending = await pendingResults(50);
    res.json({
      success: true,
      pending_count: pending.length,
      pending: pending.map((p) => ({
        id: p.id,
        session_id: p.session_id,
        attempts: p.attempts,
      })),
    });
  } catch (err) {
    next(err);
  }
});

/** POST /api/trainer/admin/outbox/flush — deliver now (admin). */
integrationRouter.post('/integrations/outbox/flush', requireAuth, requireAdmin, async (_req, res, next) => {
  try {
    res.json({ success: true, ...(await flushOutbox(50)) });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/trainer/admin/sessions/:id/requeue
 * Rebuild and re-queue the outbound payload for a session — used when the
 * analytics side lost a result. ON CONFLICT DO NOTHING keeps it idempotent.
 */
integrationRouter.post('/integrations/sessions/:id/requeue', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) throw new HttpError(400, 'session id tidak valid.');
    const payload = await buildResultPayload(id);
    if (!payload) throw new HttpError(404, 'Sesi belum punya evaluasi, jadi belum bisa dikirim.');
    await enqueueResult(id, payload);
    res.json({ success: true, session_id: id, queued: true });
  } catch (err) {
    next(err);
  }
});
