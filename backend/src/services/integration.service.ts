import { z } from 'zod';

import { query, connect } from '../db/pool.js';
import { HttpError } from '../middleware/error.middleware.js';
import { env } from '../config/env.js';

/**
 * Integration contract with the Sales Analytics project (Stage 11, PRD §80–§83).
 *
 * Direction 1 — INBOUND: analytics decides "this sales needs training on X" and
 *   POSTs an assignment. `external_ref` makes it idempotent: replaying the same
 *   training need cannot create a second assignment.
 *
 * Direction 2 — OUTBOUND: once a session is evaluated, the result is queued in
 *   `trainer_result_outbox` (UNIQUE per session_id) and delivered by the worker.
 *   The outbox row is written in the SAME transaction as the evaluation, so a
 *   crash can never lose a result that was already scored.
 */

// ── Inbound: assignment ─────────────────────────────────────────────────────

export const assignmentInput = z.object({
  sales_id: z.coerce.number().int().positive(),
  module_code: z.string().min(1).max(64).optional(),
  module_id: z.coerce.number().int().positive().optional(),
  skill: z.string().max(120).optional(),
  priority: z.enum(['low', 'normal', 'high', 'urgent']).default('normal'),
  target_score: z.coerce.number().int().min(0).max(100).optional(),
  due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  context: z.record(z.unknown()).default({}),
  external_ref: z.string().min(1).max(200),
});

export interface AssignmentResult {
  id: number;
  sales_id: number;
  module_id: number;
  module_code: string;
  external_ref: string;
  created: boolean;
}

/**
 * Create (or return) a training assignment.
 *
 * Idempotent on (source='analytics', external_ref). A replay returns the existing
 * row with created=false rather than erroring, so the analytics side can retry
 * safely without special-casing a 409.
 */
export async function upsertAssignment(
  input: z.infer<typeof assignmentInput>,
): Promise<AssignmentResult> {
  // Resolve the module by id or by code (analytics knows the code, not our id).
  let moduleId = input.module_id;
  if (!moduleId) {
    if (!input.module_code) {
      throw new HttpError(400, 'Salah satu dari module_id atau module_code wajib diisi.');
    }
    const { rows } = await query<{ id: number; code: string }>(
      `SELECT id, code FROM trainer_modules WHERE code = $1 AND active ORDER BY version DESC LIMIT 1`,
      [input.module_code],
    );
    if (!rows[0]) {
      throw new HttpError(404, `Modul dengan code "${input.module_code}" tidak ditemukan.`);
    }
    moduleId = rows[0].id;
  }

  const { rows: mod } = await query<{ id: number; code: string }>(
    `SELECT id, code FROM trainer_modules WHERE id = $1 AND active`,
    [moduleId],
  );
  if (!mod[0]) throw new HttpError(404, `Modul id ${moduleId} tidak ditemukan atau tidak aktif.`);

  const { rows: sales } = await query(`SELECT id FROM users WHERE id = $1`, [input.sales_id]);
  if (!sales[0]) throw new HttpError(404, `Sales id ${input.sales_id} tidak ditemukan.`);

  const { rows } = await query<{ id: number; created: boolean }>(
    `INSERT INTO trainer_assignments
       (sales_id, module_id, skill, priority, target_score, context, due_date,
        source, external_ref, status)
     VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,'analytics',$8,'assigned')
     ON CONFLICT (source, external_ref) WHERE external_ref IS NOT NULL
     DO UPDATE SET updated_at = now()
     RETURNING id, (xmax = 0) AS created`,
    [
      input.sales_id,
      moduleId,
      input.skill ?? null,
      input.priority,
      input.target_score ?? null,
      JSON.stringify(input.context),
      input.due_date ?? null,
      input.external_ref,
    ],
  );

  const row = rows[0]!;
  return {
    id: row.id,
    sales_id: input.sales_id,
    module_id: moduleId,
    module_code: mod[0].code,
    external_ref: input.external_ref,
    created: row.created,
  };
}

/** Assignments for a sales, with module labels — drives the app's assignment list. */
export async function listAssignments(salesId: number): Promise<
  Array<{
    id: number;
    module_id: number;
    module_code: string;
    module_name: string;
    skill: string | null;
    priority: string;
    target_score: number | null;
    status: string;
    due_date: string | null;
    context: unknown;
  }>
> {
  const { rows } = await query(
    `SELECT a.id, a.module_id, m.code AS module_code, m.name AS module_name,
            a.skill, a.priority, a.target_score, a.status, a.due_date, a.context
       FROM trainer_assignments a
       JOIN trainer_modules m ON m.id = a.module_id
      WHERE a.sales_id = $1
      ORDER BY
        CASE a.priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'normal' THEN 2 ELSE 3 END,
        a.created_at DESC`,
    [salesId],
  );
  return rows as never;
}

// ── Outbound: result delivery ───────────────────────────────────────────────

/**
 * Queue an evaluation result for delivery to analytics.
 *
 * Called from inside the evaluation transaction so the outbox row and the
 * evaluation are committed together — either both exist or neither does.
 */
export async function enqueueResult(sessionId: number, payload: unknown): Promise<void> {
  await query(
    `INSERT INTO trainer_result_outbox (session_id, payload)
     VALUES ($1, $2::jsonb)
     ON CONFLICT (session_id) DO NOTHING`,
    [sessionId, JSON.stringify(payload)],
  );
}

/** Undelivered outbox rows, oldest first. */
export async function pendingResults(limit = 20): Promise<
  Array<{ id: number; session_id: number; payload: unknown; attempts: number }>
> {
  const { rows } = await query<{
    id: number;
    session_id: number;
    payload: unknown;
    attempts: number;
  }>(
    `SELECT id, session_id, payload, attempts
       FROM trainer_result_outbox
      WHERE delivered_at IS NULL AND attempts < 10
      ORDER BY created_at
      LIMIT $1`,
    [limit],
  );
  return rows;
}

export async function markResultDelivered(id: number): Promise<void> {
  await query(
    `UPDATE trainer_result_outbox SET delivered_at = now(), last_error = NULL WHERE id = $1`,
    [id],
  );
}

export async function markResultFailed(id: number, error: string): Promise<void> {
  await query(
    `UPDATE trainer_result_outbox
        SET attempts = attempts + 1, last_error = $2, updated_at = now()
      WHERE id = $1`,
    [id, error.slice(0, 500)],
  );
}

/**
 * Deliver one result to the analytics callback.
 *
 * Uses the session_id as the idempotency key so a duplicate delivery is a no-op
 * on their side (PRD §82). Returns true when delivered (or when analytics reports
 * it already has it), false when the caller should retry later.
 */
export async function deliverResult(row: {
  id: number;
  session_id: number;
  payload: unknown;
}): Promise<boolean> {
  if (!env.ANALYTICS_CALLBACK_URL) {
    // Delivery disabled: leave the row queued rather than marking it sent.
    return false;
  }

  const body = JSON.stringify({
    idempotency_key: `trainer_session_${row.session_id}`,
    session_id: row.session_id,
    result: row.payload,
  });

  try {
    const res = await fetch(env.ANALYTICS_CALLBACK_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(env.TRAINER_API_KEY ? { 'X-API-KEY': env.TRAINER_API_KEY } : {}),
      },
      body,
      signal: AbortSignal.timeout(30_000),
    });

    if (res.ok || res.status === 409) {
      // 409 = analytics already recorded this session; treat as delivered.
      await markResultDelivered(row.id);
      return true;
    }
    const text = await res.text().catch(() => '');
    await markResultFailed(row.id, `HTTP ${res.status}: ${text.slice(0, 200)}`);
    return false;
  } catch (err) {
    await markResultFailed(row.id, (err as Error).message);
    return false;
  }
}

/**
 * Drain the outbox. Returns how many were delivered in this pass.
 *
 * Reconciles first: flush is the single "make the outbox correct, then send"
 * operation, so an operator hitting the endpoint gets the same recovery the
 * worker does, instead of a flush that silently sends nothing.
 */
export async function flushOutbox(limit = 20): Promise<{
  delivered: number;
  pending: number;
  reconciled: number;
}> {
  const reconciled = await reconcileOutbox(limit);

  const rows = await pendingResults(limit);
  let delivered = 0;
  for (const row of rows) {
    if (await deliverResult(row)) delivered += 1;
  }
  const { rows: left } = await query<{ n: string }>(
    `SELECT count(*)::text AS n FROM trainer_result_outbox WHERE delivered_at IS NULL`,
  );
  return { delivered, pending: Number(left[0]?.n ?? 0), reconciled };
}

/**
 * Close the enqueue gap: any completed evaluation without an outbox row is
 * re-queued.
 *
 * Without this, a crash between committing the evaluation and writing the outbox
 * row would silently drop a result. Enqueue is idempotent (UNIQUE session_id), so
 * this can run as often as the worker likes without duplicating anything.
 */
export async function reconcileOutbox(limit = 50): Promise<number> {
  const { rows } = await query<{ session_id: number }>(
    `SELECT e.session_id
       FROM trainer_evaluations e
       LEFT JOIN trainer_result_outbox o ON o.session_id = e.session_id
      WHERE e.status = 'completed' AND o.id IS NULL
      ORDER BY e.created_at
      LIMIT $1`,
    [limit],
  );

  let queued = 0;
  for (const r of rows) {
    const payload = await buildResultPayload(r.session_id);
    if (payload) {
      await enqueueResult(r.session_id, payload);
      queued += 1;
    }
  }
  return queued;
}

/**
 * Build the outbound result payload for a session (PRD §83 field list).
 * Reads from the immutable evaluation row so the payload cannot drift.
 */
export async function buildResultPayload(sessionId: number): Promise<unknown | undefined> {
  const { rows } = await query<{
    session_id: number;
    sales_id: number;
    module_id: number;
    module_code: string;
    scenario_id: number;
    attempt: number;
    duration_seconds: number | null;
    overall_score: number | null;
    passed: boolean | null;
    feedback: unknown;
    strengths: string[] | null;
    weaknesses: string[] | null;
    critical_errors: string[] | null;
    confidence: number | null;
    ai_model: string | null;
    prompt_version_id: number | null;
  }>(
    `SELECT s.id AS session_id, s.sales_id, sc.module_id, m.code AS module_code,
            s.scenario_id, s.attempt, s.duration_seconds,
            e.overall_score,
            (e.feedback->>'passed')::boolean AS passed,
            e.feedback,
            e.strengths, e.weaknesses, e.critical_errors, e.confidence,
            e.ai_model, e.prompt_version_id
       FROM trainer_sessions s
       JOIN trainer_scenarios sc ON sc.id = s.scenario_id
       JOIN trainer_modules m ON m.id = sc.module_id
       JOIN trainer_evaluations e ON e.session_id = s.id
      WHERE s.id = $1`,
    [sessionId],
  );
  const r = rows[0];
  if (!r) return undefined;

  return {
    training_session_id: r.session_id,
    sales_id: r.sales_id,
    module_id: r.module_id,
    module_code: r.module_code,
    scenario_id: r.scenario_id,
    attempt: r.attempt,
    duration_seconds: r.duration_seconds,
    score: r.overall_score,
    pass: r.passed,
    competency_scores: (r.feedback as { competencies?: unknown })?.competencies ?? [],
    strengths: r.strengths ?? [],
    weaknesses: r.weaknesses ?? [],
    critical_errors: r.critical_errors ?? [],
    confidence: r.confidence,
    ai_model: r.ai_model,
    prompt_version_id: r.prompt_version_id,
  };
}

/**
 * Close a training assignment once its module is passed.
 * Called after evaluation so analytics sees the training need resolved.
 */
export async function closeAssignmentIfPassed(salesId: number, moduleId: number, passed: boolean): Promise<number> {
  if (!passed) return 0;
  const client = await connect();
  try {
    await client.query('BEGIN');
    const { rowCount } = await client.query(
      `UPDATE trainer_assignments
          SET status = 'completed', updated_at = now()
        WHERE sales_id = $1 AND module_id = $2 AND status <> 'completed'`,
      [salesId, moduleId],
    );
    await client.query('COMMIT');
    return rowCount ?? 0;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}
