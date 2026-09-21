import pg from 'pg';
import { query } from '../db/pool.js';

const ODOO_CONFIG = {
  host: process.env.ODOO_DB_HOST || '172.28.0.3',
  port: Number(process.env.ODOO_DB_PORT || 5432),
  database: process.env.ODOO_DB_NAME || 'agi',
  user: process.env.ODOO_DB_USER || 'odoo16',
  password: process.env.ODOO_DB_PASSWORD || 'rootagi',
};

let odooPool: pg.Pool | null = null;

function getOdooPool(): pg.Pool {
  if (!odooPool) {
    odooPool = new pg.Pool(ODOO_CONFIG);
    odooPool.on('error', (err) => {
      console.error('[odoo-sync] PG Pool Error:', err);
    });
  }
  return odooPool;
}

/**
 * Sinkronisasi hasil evaluasi sesi latihan ke Odoo 16.
 */
export async function syncSessionToOdoo(sessionId: number): Promise<boolean> {
  try {
    const { rows } = await query<{
      session_id: number;
      username: string;
      module_code: string;
      module_name: string;
      scenario_name: string;
      duration_seconds: number | null;
      created_at: Date;
      overall_score: number | null;
      ai_model: string | null;
      strengths: string[] | null;
      weaknesses: string[] | null;
      critical_errors: string[] | null;
      recommendation: string | null;
      evaluation_id: number;
    }>(
      `SELECT s.id AS session_id,
              COALESCE(u.username, 'admin') AS username,
              m.code AS module_code,
              m.name AS module_name,
              sc.name AS scenario_name,
              s.duration_seconds,
              s.created_at,
              e.overall_score,
              e.ai_model,
              e.strengths,
              e.weaknesses,
              e.critical_errors,
              e.recommendation,
              e.id AS evaluation_id
       FROM trainer_sessions s
       JOIN trainer_scenarios sc ON s.scenario_id = sc.id
       JOIN trainer_modules m ON sc.module_id = m.id
       JOIN trainer_evaluations e ON e.session_id = s.id
       LEFT JOIN users u ON u.id = s.sales_id
       WHERE s.id = $1`,
      [sessionId],
    );

    if (rows.length === 0) return false;
    const s = rows[0]!;

    // Transkrip
    const turnsRes = await query<{ speaker: string; text: string }>(
      `SELECT speaker, text FROM trainer_turns WHERE session_id = $1 ORDER BY id ASC`,
      [sessionId],
    );
    const transcript = turnsRes.rows.map((t) => `${t.speaker}: ${t.text}`).join('\n');

    // Rubrik
    const rubricsRes = await query<{
      competency: string;
      score: number;
      weight: number;
      evidence: string;
    }>(
      `SELECT competency, score, weight, evidence FROM trainer_competency_scores WHERE evaluation_id = $1`,
      [s.evaluation_id],
    );

    const sessionCode = `SES-${String(s.session_id).padStart(5, '0')}`;
    const strengthsStr = s.strengths?.length ? '• ' + s.strengths.join('\n• ') : '';
    const weaknessesStr = s.weaknesses?.length ? '• ' + s.weaknesses.join('\n• ') : '';
    const critStr = s.critical_errors?.length ? '• ' + s.critical_errors.join('\n• ') : '';
    const score = s.overall_score ?? 0;
    const resultStatus = score >= 75 ? 'passed' : 'failed';

    const pool = getOdooPool();

    // 1. Upsert session ke Odoo
    const odooSessionRes = await pool.query<{ id: number }>(
      `INSERT INTO trainer_session (
         session_code, user_id, sales_name, scenario_id, module_id,
         start_time, duration_seconds, overall_score, result_status,
         ai_model, strengths, weaknesses, critical_errors, recommendation, transcript,
         create_date, write_date, create_uid, write_uid
       )
       SELECT
         $1, 2, $2, sc.id, m.id, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW(), NOW(), 2, 2
       FROM trainer_scenario sc
       JOIN trainer_module m ON sc.module_id = m.id
       WHERE sc.name = $13
       LIMIT 1
       ON CONFLICT (session_code) DO UPDATE SET
         overall_score = EXCLUDED.overall_score,
         result_status = EXCLUDED.result_status,
         duration_seconds = EXCLUDED.duration_seconds,
         strengths = EXCLUDED.strengths,
         weaknesses = EXCLUDED.weaknesses,
         critical_errors = EXCLUDED.critical_errors,
         recommendation = EXCLUDED.recommendation,
         transcript = EXCLUDED.transcript,
         write_date = NOW()
       RETURNING id`,
      [
        sessionCode,
        s.username,
        s.created_at,
        s.duration_seconds || 0,
        score,
        resultStatus,
        s.ai_model || '',
        strengthsStr,
        weaknessesStr,
        critStr,
        s.recommendation || '',
        transcript,
        s.scenario_name,
      ],
    );

    const odooSessionId = odooSessionRes.rows[0]?.id;
    if (odooSessionId) {
      await pool.query(`DELETE FROM trainer_score_line WHERE session_id = $1`, [odooSessionId]);
      for (const rb of rubricsRes.rows) {
        await pool.query(
          `INSERT INTO trainer_score_line (session_id, rubric_code, rubric_name, weight, score, notes, create_date, write_date, create_uid, write_uid)
           VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW(), 2, 2)`,
          [odooSessionId, rb.competency, rb.competency, rb.weight, rb.score, rb.evidence],
        );
      }
    }

    return true;
  } catch (err) {
    console.error(`[odoo-sync] Gagal sinkron sesi ${sessionId} ke Odoo:`, (err as Error).message);
    return false;
  }
}
