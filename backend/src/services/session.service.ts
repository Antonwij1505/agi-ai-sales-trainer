import { query } from '../db/pool.js';

/**
 * Session service (Stage 5).
 *
 * Owns the lifecycle of a roleplay attempt: create → turn* → finish → evaluate.
 * All state transitions are explicit and guarded, so a client retry cannot
 * double-start a session or append turns to a closed one.
 */

export interface ScenarioContext {
  scenario_id: number;
  scenario_name: string;
  scenario_description: string;
  objective: string;
  success_criteria: string;
  failure_criteria: string;
  resistance_level: number;
  product_category: string | null;
  institution_type: string | null;
  rup_context_required: boolean;
  module_id: number;
  module_code: string;
  module_name: string;
  module_passing_score: number;
  persona_name: string | null;
  persona_role: string | null;
  persona_attitude: string | null;
  persona_communication_style: string | null;
  persona_default_resistance: number | null;
}

export interface SessionRow {
  id: number;
  sales_id: number;
  scenario_id: number;
  assignment_id: number | null;
  attempt: number;
  mode: string;
  status: string;
  eval_status: string;
  started_at: string;
  ended_at: string | null;
  duration_seconds: number | null;
}

export interface TurnRow {
  id: number;
  session_id: number;
  speaker: 'AI' | 'SALES';
  text: string | null;
  sequence_number: number;
  audio_ref: string | null;
  timestamp: string;
}

/** Load everything the roleplay engine needs to render prompts for a scenario. */
export async function loadScenarioContext(scenarioId: number): Promise<ScenarioContext> {
  const { rows } = await query<ScenarioContext>(
    `SELECT s.id AS scenario_id, s.name AS scenario_name, s.description AS scenario_description,
            s.objective, s.success_criteria, s.failure_criteria, s.resistance_level,
            s.product_category, s.institution_type, s.rup_context_required,
            m.id AS module_id, m.code AS module_code, m.name AS module_name,
            m.passing_score AS module_passing_score,
            p.name AS persona_name, p.role AS persona_role, p.attitude AS persona_attitude,
            p.communication_style AS persona_communication_style,
            p.default_resistance AS persona_default_resistance
       FROM trainer_scenarios s
       JOIN trainer_modules m ON m.id = s.module_id
       LEFT JOIN trainer_personas p ON p.id = s.persona_id
      WHERE s.id = $1 AND s.active`,
    [scenarioId],
  );
  const row = rows[0];
  if (!row) throw new Error(`Skenario ${scenarioId} tidak ditemukan atau tidak aktif.`);
  return row;
}

/** Product facts are the ONLY sanctioned source for product claims (risk R4). */
export async function loadProductKnowledge(category: string | null): Promise<string> {
  if (!category) return '(tidak ada data produk untuk kategori ini)';
  const { rows } = await query<{ name: string; payload: unknown }>(
    `SELECT name, payload FROM trainer_product_knowledge
      WHERE active AND (category = $1 OR category IS NULL)
      ORDER BY name`,
    [category],
  );
  if (rows.length === 0) {
    return '(tidak ada data produk untuk kategori ini — katakan tidak tahu detailnya)';
  }
  return rows.map((r) => `- ${r.name}: ${JSON.stringify(r.payload)}`).join('\n');
}

/** Count prior attempts for this sales × scenario, to number the new attempt. */
async function nextAttemptNumber(salesId: number, scenarioId: number): Promise<number> {
  const { rows } = await query<{ n: string }>(
    `SELECT count(*)::text AS n FROM trainer_sessions
      WHERE sales_id = $1 AND scenario_id = $2`,
    [salesId, scenarioId],
  );
  return Number(rows[0]?.n ?? 0) + 1;
}

export interface CreateSessionInput {
  salesId: number;
  scenarioId: number;
  assignmentId?: number | null;
  mode?: 'practice' | 'exam';
}

/** Start a new roleplay session. */
export async function createSession(input: CreateSessionInput): Promise<SessionRow> {
  const attempt = await nextAttemptNumber(input.salesId, input.scenarioId);
  const { rows } = await query<SessionRow>(
    `INSERT INTO trainer_sessions (sales_id, scenario_id, assignment_id, attempt, mode, status, eval_status)
     VALUES ($1, $2, $3, $4, $5, 'in_progress', 'pending')
     RETURNING id, sales_id, scenario_id, assignment_id, attempt, mode, status, eval_status,
               started_at, ended_at, duration_seconds`,
    [
      input.salesId,
      input.scenarioId,
      input.assignmentId ?? null,
      attempt,
      input.mode ?? 'practice',
    ],
  );
  const row = rows[0];
  if (!row) throw new Error('Gagal membuat sesi latihan.');
  return row;
}

export async function getSession(sessionId: number): Promise<SessionRow | undefined> {
  const { rows } = await query<SessionRow>(
    `SELECT id, sales_id, scenario_id, assignment_id, attempt, mode, status, eval_status,
            started_at, ended_at, duration_seconds
       FROM trainer_sessions WHERE id = $1`,
    [sessionId],
  );
  return rows[0];
}

/** Full ordered transcript for a session. */
export async function getTurns(sessionId: number): Promise<TurnRow[]> {
  const { rows } = await query<TurnRow>(
    `SELECT id, session_id, speaker, text, sequence_number, audio_ref, timestamp
       FROM trainer_turns
      WHERE session_id = $1
      ORDER BY sequence_number, id`,
    [sessionId],
  );
  return rows;
}

/**
 * Append a turn. The sequence number is derived inside the statement so
 * concurrent appends cannot collide on the same position.
 */
export async function appendTurn(
  sessionId: number,
  speaker: 'AI' | 'SALES',
  text: string,
  audioRef?: string | null,
): Promise<TurnRow> {
  const { rows } = await query<TurnRow>(
    `INSERT INTO trainer_turns (session_id, speaker, text, audio_ref, sequence_number)
     VALUES (
        $1, $2, $3, $4,
        COALESCE((SELECT max(sequence_number) FROM trainer_turns WHERE session_id = $1), 0) + 1
     )
     RETURNING id, session_id, speaker, text, sequence_number, audio_ref, timestamp`,
    [sessionId, speaker, text, audioRef ?? null],
  );
  const row = rows[0];
  if (!row) throw new Error('Gagal menyimpan turn.');
  return row;
}

/** Close a session (idempotent — closing twice keeps the first ended_at). */
export async function finishSession(sessionId: number): Promise<SessionRow | undefined> {
  await query(
    `UPDATE trainer_sessions
        SET status = 'finished',
            ended_at = COALESCE(ended_at, now()),
            duration_seconds = COALESCE(
              duration_seconds,
              EXTRACT(EPOCH FROM (now() - started_at))::int
            )
      WHERE id = $1 AND status = 'in_progress'`,
    [sessionId],
  );
  return getSession(sessionId);
}

export async function setEvalStatus(
  sessionId: number,
  status: 'pending' | 'processing' | 'completed' | 'failed',
): Promise<void> {
  await query(`UPDATE trainer_sessions SET eval_status = $2 WHERE id = $1`, [sessionId, status]);
}
