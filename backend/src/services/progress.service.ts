import { query, connect } from '../db/pool.js';
import { HttpError } from '../middleware/error.middleware.js';

/**
 * Progress, history and retry (Stage 8, PRD §57).
 *
 * `trainer_progress` is a ROLLED-UP table derived from evaluations. Rather than
 * trusting incremental updates (which drift when an evaluation is re-run or a
 * session is deleted), it is recomputed from the source rows inside one
 * transaction. Recompute is idempotent: running it twice yields the same numbers.
 */

export interface ProgressRow {
  id: number;
  sales_id: number;
  module_id: number;
  first_score: number | null;
  latest_score: number | null;
  highest_score: number | null;
  avg_score: string | null;
  attempts: number;
  improvement: number | null;
  pass_status: string;
}

export interface HistoryItem {
  session_id: number;
  scenario_id: number;
  scenario_name: string;
  module_id: number;
  module_code: string;
  module_name: string;
  attempt: number;
  mode: string;
  status: string;
  started_at: string;
  duration_seconds: number | null;
  overall_score: number | null;
  passed: boolean | null;
  eval_status: string;
  prompt_version_id: number | null;
  ai_model: string | null;
}

/**
 * Recompute `trainer_progress` for one sales × module from the evaluation rows.
 *
 * Only COMPLETED evaluations with a non-null score count. `first_score` is the
 * earliest attempt by session start time, not by insertion order, so a backdated
 * session cannot corrupt the trend.
 */
export async function recomputeProgress(salesId: number, moduleId: number): Promise<ProgressRow | undefined> {
  const client = await connect();
  try {
    await client.query('BEGIN');

    const { rows: stats } = await client.query<{
      first_score: number | null;
      latest_score: number | null;
      highest_score: number | null;
      avg_score: string | null;
      attempts: string;
      passing_score: number;
    }>(
      `WITH scored AS (
         SELECT e.overall_score,
                s.started_at,
                m.passing_score
           FROM trainer_sessions s
           JOIN trainer_scenarios sc ON sc.id = s.scenario_id
           JOIN trainer_modules m ON m.id = sc.module_id
           JOIN trainer_evaluations e ON e.session_id = s.id
          WHERE s.sales_id = $1
            AND sc.module_id = $2
            AND e.status = 'completed'
            AND e.overall_score IS NOT NULL
       )
       SELECT
         (SELECT overall_score FROM scored ORDER BY started_at ASC  LIMIT 1) AS first_score,
         (SELECT overall_score FROM scored ORDER BY started_at DESC LIMIT 1) AS latest_score,
         (SELECT max(overall_score) FROM scored) AS highest_score,
         (SELECT round(avg(overall_score), 2) FROM scored) AS avg_score,
         (SELECT count(*)::text FROM scored) AS attempts,
         COALESCE((SELECT max(passing_score) FROM scored), 80) AS passing_score`,
      [salesId, moduleId],
    );

    const s = stats[0];
    if (!s || Number(s.attempts) === 0) {
      await client.query('COMMIT');
      return undefined;
    }

    const attempts = Number(s.attempts);
    const improvement =
      s.first_score !== null && s.latest_score !== null ? s.latest_score - s.first_score : null;
    const passStatus =
      s.highest_score !== null && s.highest_score >= s.passing_score ? 'passed' : 'not_passed';

    const { rows } = await client.query<ProgressRow>(
      `INSERT INTO trainer_progress
         (sales_id, module_id, first_score, latest_score, highest_score,
          avg_score, attempts, improvement, pass_status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       ON CONFLICT (sales_id, module_id) DO UPDATE SET
         first_score   = EXCLUDED.first_score,
         latest_score  = EXCLUDED.latest_score,
         highest_score = EXCLUDED.highest_score,
         avg_score     = EXCLUDED.avg_score,
         attempts      = EXCLUDED.attempts,
         improvement   = EXCLUDED.improvement,
         pass_status   = EXCLUDED.pass_status,
         updated_at    = now()
       RETURNING id, sales_id, module_id, first_score, latest_score, highest_score,
                 avg_score, attempts, improvement, pass_status`,
      [
        salesId,
        moduleId,
        s.first_score,
        s.latest_score,
        s.highest_score,
        s.avg_score,
        attempts,
        improvement,
        passStatus,
      ],
    );

    await client.query('COMMIT');
    return rows[0];
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Attempt history for a sales, newest first.
 * `moduleId` narrows it to one module (used by the progress screen).
 */
export async function getHistory(
  salesId: number,
  moduleId?: number,
): Promise<HistoryItem[]> {
  const params: unknown[] = [salesId];
  let filter = '';
  if (moduleId !== undefined) {
    params.push(moduleId);
    filter = 'AND sc.module_id = $2';
  }

  const { rows } = await query<HistoryItem>(
    `SELECT s.id AS session_id, s.scenario_id, sc.name AS scenario_name,
            sc.module_id, m.code AS module_code, m.name AS module_name,
            s.attempt, s.mode, s.status, s.started_at, s.duration_seconds,
            e.overall_score,
            (e.feedback->>'passed')::boolean AS passed,
            s.eval_status, e.prompt_version_id, e.ai_model
       FROM trainer_sessions s
       JOIN trainer_scenarios sc ON sc.id = s.scenario_id
       JOIN trainer_modules m ON m.id = sc.module_id
       LEFT JOIN trainer_evaluations e ON e.session_id = s.id
      WHERE s.sales_id = $1 ${filter}
      ORDER BY s.started_at DESC`,
    params,
  );
  return rows;
}

/** Progress rows for one sales, with module labels for the UI. */
export async function getProgress(salesId: number): Promise<
  Array<ProgressRow & { module_code: string; module_name: string; passing_score: number }>
> {
  const { rows } = await query<
    ProgressRow & { module_code: string; module_name: string; passing_score: number }
  >(
    `SELECT p.id, p.sales_id, p.module_id, p.first_score, p.latest_score, p.highest_score,
            p.avg_score, p.attempts, p.improvement, p.pass_status,
            m.code AS module_code, m.name AS module_name, m.passing_score
       FROM trainer_progress p
       JOIN trainer_modules m ON m.id = p.module_id
      WHERE p.sales_id = $1
      ORDER BY m.code`,
    [salesId],
  );
  return rows;
}

/**
 * Attempt comparison for the retry flow (PRD §57): what improved, what regressed,
 * and which competency to work on next.
 */
export interface AttemptComparison {
  module_id: number;
  module_name: string;
  attempts: Array<{
    session_id: number;
    attempt: number;
    started_at: string;
    overall_score: number | null;
    passed: boolean | null;
  }>;
  best_session_id: number | null;
  worst_competency: { competency: string; avg_score: number } | null;
  delta_from_first: number | null;
}

export async function compareAttempts(
  salesId: number,
  moduleId: number,
): Promise<AttemptComparison> {
  const { rows: attempts } = await query<{
    session_id: number;
    attempt: number;
    started_at: string;
    overall_score: number | null;
    passed: boolean | null;
  }>(
    `SELECT s.id AS session_id, s.attempt, s.started_at,
            e.overall_score,
            (e.feedback->>'passed')::boolean AS passed
       FROM trainer_sessions s
       JOIN trainer_scenarios sc ON sc.id = s.scenario_id
       LEFT JOIN trainer_evaluations e ON e.session_id = s.id
      WHERE s.sales_id = $1 AND sc.module_id = $2
      ORDER BY s.started_at ASC`,
    [salesId, moduleId],
  );

  const { rows: moduleRows } = await query<{ name: string }>(
    `SELECT name FROM trainer_modules WHERE id = $1`,
    [moduleId],
  );
  const moduleName = moduleRows[0]?.name ?? '';

  // Weakest competency across every scored evaluation in this module.
  const { rows: weak } = await query<{ competency: string; avg_score: string }>(
    `SELECT cs.competency, round(avg(cs.score), 1) AS avg_score
       FROM trainer_competency_scores cs
       JOIN trainer_evaluations e ON e.id = cs.evaluation_id
       JOIN trainer_sessions s ON s.id = e.session_id
       JOIN trainer_scenarios sc ON sc.id = s.scenario_id
      WHERE s.sales_id = $1 AND sc.module_id = $2
      GROUP BY cs.competency
      ORDER BY avg(cs.score) ASC
      LIMIT 1`,
    [salesId, moduleId],
  );

  const scored = attempts.filter((a) => a.overall_score !== null);
  const best = scored.reduce<typeof scored[number] | null>(
    (acc, a) => (acc === null || (a.overall_score ?? 0) > (acc.overall_score ?? 0) ? a : acc),
    null,
  );
  const first = scored[0];
  const last = scored[scored.length - 1];

  return {
    module_id: moduleId,
    module_name: moduleName,
    attempts: attempts.map((a) => ({
      session_id: a.session_id,
      attempt: a.attempt,
      started_at: a.started_at,
      overall_score: a.overall_score,
      passed: a.passed,
    })),
    best_session_id: best?.session_id ?? null,
    worst_competency: weak[0]
      ? { competency: weak[0].competency, avg_score: Number(weak[0].avg_score) }
      : null,
    delta_from_first:
      first && last && first.overall_score !== null && last.overall_score !== null
        ? last.overall_score - first.overall_score
        : null,
  };
}

/**
 * Start a retry: a new session on the same scenario, capped by the module's
 * `max_attempt`. Enforced here rather than in the route so every caller obeys it.
 */
export async function assertCanRetry(salesId: number, scenarioId: number): Promise<void> {
  const { rows } = await query<{ attempts: string; max_attempt: number; module_name: string }>(
    `SELECT
       (SELECT count(*)::text FROM trainer_sessions s
         WHERE s.sales_id = $1 AND s.scenario_id = $2) AS attempts,
       m.max_attempt, m.name AS module_name
     FROM trainer_scenarios sc
     JOIN trainer_modules m ON m.id = sc.module_id
    WHERE sc.id = $2`,
    [salesId, scenarioId],
  );
  const row = rows[0];
  if (!row) throw new HttpError(404, 'Skenario tidak ditemukan.');

  if (Number(row.attempts) >= row.max_attempt) {
    throw new HttpError(
      409,
      `Batas percobaan modul "${row.module_name}" sudah tercapai (${row.max_attempt}x). ` +
        'Hubungi supervisor untuk penambahan attempt.',
    );
  }
}
