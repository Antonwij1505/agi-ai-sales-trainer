import { z } from 'zod';

import { query, connect } from '../db/pool.js';
import { HttpError } from '../middleware/error.middleware.js';
import { clearPromptCache } from './prompt.service.js';

/**
 * Admin content management (Stage 10).
 *
 * The immutability rule (PRD §60/§67) shapes every write here: modules,
 * scenarios, rubrics and prompts are VERSIONED. An edit never mutates a row that
 * a past evaluation may reference — it inserts a new version and deactivates the
 * previous one. `trainer_evaluations.prompt_version_id` therefore keeps pointing
 * at the exact text that produced a score, forever.
 */

// ── Validation ──────────────────────────────────────────────────────────────

export const moduleInput = z.object({
  code: z.string().min(1).max(64),
  name: z.string().min(1).max(200),
  description: z.string().max(4000).optional(),
  category: z.string().max(64).optional(),
  difficulty: z.enum(['basic', 'intermediate', 'advanced']).optional(),
  passing_score: z.coerce.number().int().min(0).max(100).default(80),
  max_attempt: z.coerce.number().int().min(1).max(20).default(3),
  status: z.enum(['DRAFT', 'REVIEW', 'ACTIVE', 'ARCHIVED']).default('DRAFT'),
});

export const scenarioInput = z.object({
  module_id: z.coerce.number().int().positive(),
  name: z.string().min(1).max(200),
  description: z.string().max(4000).optional(),
  persona_id: z.coerce.number().int().positive().optional(),
  difficulty: z.enum(['basic', 'intermediate', 'advanced']).optional(),
  resistance_level: z.coerce.number().int().min(1).max(5).default(3),
  product_category: z.string().max(120).optional(),
  institution_type: z.string().max(120).optional(),
  objective: z.string().max(4000).optional(),
  success_criteria: z.string().max(4000).optional(),
  failure_criteria: z.string().max(4000).optional(),
  rup_context_required: z.coerce.boolean().default(false),
  status: z.enum(['DRAFT', 'REVIEW', 'ACTIVE', 'ARCHIVED']).default('DRAFT'),
});

export const personaInput = z.object({
  name: z.string().min(1).max(120),
  type: z.string().max(64).optional(),
  role: z.string().max(120).optional(),
  attitude: z.string().max(64).optional(),
  communication_style: z.string().max(64).optional(),
  knowledge_level: z.enum(['low', 'medium', 'high']).optional(),
  interest_level: z.enum(['low', 'medium', 'high']).optional(),
  urgency: z.enum(['low', 'medium', 'high']).optional(),
  existing_vendor: z.string().max(120).optional(),
  budget_condition: z.string().max(64).optional(),
  default_resistance: z.coerce.number().int().min(1).max(5).default(3),
});

export const rubricInput = z.object({
  module_id: z.coerce.number().int().positive(),
  criteria: z
    .array(
      z.object({
        name: z.string().min(1).max(200),
        competency: z.string().min(1).max(120),
        weight: z.coerce.number().int().min(1).max(100),
        criteria: z.string().max(4000).optional(),
        scoring_instruction: z.string().max(4000).optional(),
      }),
    )
    .min(1),
});

export const promptInput = z.object({
  key: z.enum(['system', 'persona', 'scenario', 'business', 'rules', 'evaluation']),
  content: z.string().min(10).max(20000),
});

// ── Modules ─────────────────────────────────────────────────────────────────

/**
 * Create a module (version 1) or publish a new version of an existing code.
 *
 * A new version copies nothing implicitly: the caller supplies the full content,
 * so a "new version" is a deliberate act, not an accidental fork.
 */
export async function upsertModule(
  input: z.infer<typeof moduleInput>,
  asNewVersion: boolean,
): Promise<{ id: number; code: string; version: number; created: boolean }> {
  const client = await connect();
  try {
    await client.query('BEGIN');

    const { rows: existing } = await client.query<{ id: number; version: number }>(
      `SELECT id, version FROM trainer_modules WHERE code = $1 ORDER BY version DESC LIMIT 1`,
      [input.code],
    );
    const current = existing[0];

    if (!current) {
      const { rows } = await client.query<{ id: number; version: number }>(
        `INSERT INTO trainer_modules
           (code, name, description, category, difficulty, passing_score, max_attempt, status, version, active)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,1,true)
         RETURNING id, version`,
        [
          input.code,
          input.name,
          input.description ?? null,
          input.category ?? null,
          input.difficulty ?? null,
          input.passing_score,
          input.max_attempt,
          input.status,
        ],
      );
      await client.query('COMMIT');
      return { id: rows[0]!.id, code: input.code, version: rows[0]!.version, created: true };
    }

    if (!asNewVersion) {
      throw new HttpError(
        409,
        `Modul "${input.code}" sudah ada (versi ${current.version}). ` +
          'Kirim new_version=true untuk membuat versi baru — konten lama tidak boleh diubah ' +
          'karena evaluasi historis merujuk ke versi tersebut.',
      );
    }

    // Deactivate the previous version, insert the next one. `status` is set too,
    // otherwise the row reads active=false while status still says ACTIVE — two
    // sources of truth that disagree and confuse the admin UI.
    await client.query(
      `UPDATE trainer_modules SET active = false, status = 'ARCHIVED' WHERE id = $1`,
      [current.id],
    );
    const { rows } = await client.query<{ id: number; version: number }>(
      `INSERT INTO trainer_modules
         (code, name, description, category, difficulty, passing_score, max_attempt, status, version, active)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,true)
       RETURNING id, version`,
      [
        input.code,
        input.name,
        input.description ?? null,
        input.category ?? null,
        input.difficulty ?? null,
        input.passing_score,
        input.max_attempt,
        input.status,
        current.version + 1,
      ],
    );
    await client.query('COMMIT');
    return { id: rows[0]!.id, code: input.code, version: rows[0]!.version, created: true };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

/** Soft-delete: deactivate rather than delete, so history stays intact. */
export async function deactivateModule(id: number): Promise<boolean> {
  const { rowCount } = await query(
    `UPDATE trainer_modules SET active = false, status = 'ARCHIVED' WHERE id = $1 AND active`,
    [id],
  );
  return (rowCount ?? 0) > 0;
}

// ── Scenarios ───────────────────────────────────────────────────────────────

export async function createScenario(
  input: z.infer<typeof scenarioInput>,
): Promise<{ id: number }> {
  const { rows: mod } = await query<{ id: number }>(
    `SELECT id FROM trainer_modules WHERE id = $1 AND active`,
    [input.module_id],
  );
  if (!mod[0]) throw new HttpError(400, 'module_id tidak ditemukan atau tidak aktif.');

  if (input.persona_id) {
    const { rows: p } = await query(`SELECT id FROM trainer_personas WHERE id = $1 AND active`, [
      input.persona_id,
    ]);
    if (!p[0]) throw new HttpError(400, 'persona_id tidak ditemukan atau tidak aktif.');
  }

  const { rows } = await query<{ id: number }>(
    `INSERT INTO trainer_scenarios
       (module_id, name, description, persona_id, difficulty, resistance_level,
        product_category, institution_type, objective, success_criteria,
        failure_criteria, rup_context_required, status)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
     RETURNING id`,
    [
      input.module_id,
      input.name,
      input.description ?? null,
      input.persona_id ?? null,
      input.difficulty ?? null,
      input.resistance_level,
      input.product_category ?? null,
      input.institution_type ?? null,
      input.objective ?? null,
      input.success_criteria ?? null,
      input.failure_criteria ?? null,
      input.rup_context_required,
      input.status,
    ],
  );
  return { id: rows[0]!.id };
}

export async function updateScenario(
  id: number,
  patch: Partial<z.infer<typeof scenarioInput>>,
): Promise<boolean> {
  // Scenarios are edited in place only while no session references them; once a
  // session exists the content is part of the training record.
  const { rows } = await query<{ n: string }>(
    `SELECT count(*)::text AS n FROM trainer_sessions WHERE scenario_id = $1`,
    [id],
  );
  if (Number(rows[0]?.n ?? 0) > 0) {
    throw new HttpError(
      409,
      'Skenario ini sudah dipakai pada sesi latihan, jadi isinya tidak boleh diubah. ' +
        'Buat skenario baru sebagai gantinya.',
    );
  }

  const fields: string[] = [];
  const values: unknown[] = [];
  let i = 1;
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined) continue;
    fields.push(`${k} = $${i++}`);
    values.push(v);
  }
  if (fields.length === 0) return false;
  values.push(id);

  const { rowCount } = await query(
    `UPDATE trainer_scenarios SET ${fields.join(', ')} WHERE id = $${i} AND active`,
    values,
  );
  return (rowCount ?? 0) > 0;
}

export async function deactivateScenario(id: number): Promise<boolean> {
  const { rowCount } = await query(
    `UPDATE trainer_scenarios SET active = false, status = 'ARCHIVED' WHERE id = $1 AND active`,
    [id],
  );
  return (rowCount ?? 0) > 0;
}

// ── Personas ────────────────────────────────────────────────────────────────

export async function createPersona(input: z.infer<typeof personaInput>): Promise<{ id: number }> {
  const { rows } = await query<{ id: number }>(
    `INSERT INTO trainer_personas
       (name, type, role, attitude, communication_style, knowledge_level,
        interest_level, urgency, existing_vendor, budget_condition, default_resistance)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
     RETURNING id`,
    [
      input.name,
      input.type ?? null,
      input.role ?? null,
      input.attitude ?? null,
      input.communication_style ?? null,
      input.knowledge_level ?? null,
      input.interest_level ?? null,
      input.urgency ?? null,
      input.existing_vendor ?? null,
      input.budget_condition ?? null,
      input.default_resistance,
    ],
  );
  return { id: rows[0]!.id };
}

// ── Rubric ──────────────────────────────────────────────────────────────────

/**
 * Publish a rubric version for a module.
 *
 * The weights MUST sum to 100: the scoring arithmetic divides by the rubric's
 * total weight, so an unnormalised rubric would silently rescale every score.
 * Rejecting at write time is far cheaper than discovering it in a report.
 */
export async function publishRubric(input: z.infer<typeof rubricInput>): Promise<{
  module_id: number;
  version: number;
  criteria: number;
  total_weight: number;
}> {
  const totalWeight = input.criteria.reduce((s, c) => s + c.weight, 0);
  if (totalWeight !== 100) {
    throw new HttpError(
      400,
      `Total bobot rubric harus tepat 100, saat ini ${totalWeight}. ` +
        'Perbaiki bobot tiap kompetensi sebelum dipublikasikan.',
    );
  }

  const client = await connect();
  try {
    await client.query('BEGIN');

    const { rows: mod } = await client.query<{ id: number }>(
      `SELECT id FROM trainer_modules WHERE id = $1`,
      [input.module_id],
    );
    if (!mod[0]) throw new HttpError(400, 'module_id tidak ditemukan.');

    const { rows: verRows } = await client.query<{ v: number }>(
      `SELECT COALESCE(max(version), 0) AS v FROM trainer_rubrics WHERE module_id = $1`,
      [input.module_id],
    );
    const version = Number(verRows[0]?.v ?? 0) + 1;

    // Retire the previous version; evaluations referencing it stay explainable.
    await client.query(`UPDATE trainer_rubrics SET active = false WHERE module_id = $1 AND active`, [
      input.module_id,
    ]);

    for (const c of input.criteria) {
      await client.query(
        `INSERT INTO trainer_rubrics
           (module_id, name, competency, weight, criteria, scoring_instruction, version, active)
         VALUES ($1,$2,$3,$4,$5,$6,$7,true)`,
        [
          input.module_id,
          c.name,
          c.competency,
          c.weight,
          c.criteria ?? null,
          c.scoring_instruction ?? null,
          version,
        ],
      );
    }

    await client.query('COMMIT');
    return { module_id: input.module_id, version, criteria: input.criteria.length, total_weight: totalWeight };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

// ── Prompts ─────────────────────────────────────────────────────────────────

/** Publish a new prompt version. The previous one is deactivated, never edited. */
export async function publishPrompt(input: z.infer<typeof promptInput>): Promise<{
  id: number;
  key: string;
  version: number;
}> {
  const client = await connect();
  try {
    await client.query('BEGIN');

    const { rows: verRows } = await client.query<{ v: number }>(
      `SELECT COALESCE(max(version), 0) AS v FROM trainer_prompts WHERE key = $1`,
      [input.key],
    );
    const version = Number(verRows[0]?.v ?? 0) + 1;

    await client.query(`UPDATE trainer_prompts SET active = false WHERE key = $1 AND active`, [
      input.key,
    ]);

    const { rows } = await client.query<{ id: number }>(
      `INSERT INTO trainer_prompts (key, version, content, active)
       VALUES ($1,$2,$3,true) RETURNING id`,
      [input.key, version, input.content],
    );

    await client.query('COMMIT');
    // The prompt cache must not serve the retired version for the next 30s.
    clearPromptCache();
    return { id: rows[0]!.id, key: input.key, version };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

/** Prompt history for a key, newest first — used by the admin audit view. */
export async function listPromptVersions(key: string): Promise<
  Array<{ id: number; version: number; active: boolean; created_at: string; preview: string }>
> {
  const { rows } = await query<{
    id: number;
    version: number;
    active: boolean;
    created_at: string;
    preview: string;
  }>(
    `SELECT id, version, active, created_at, left(content, 120) AS preview
       FROM trainer_prompts WHERE key = $1 ORDER BY version DESC`,
    [key],
  );
  return rows;
}
