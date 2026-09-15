import { z } from 'zod';

import { chatJson } from './llm.service.js';
import { getActivePrompt, render } from './prompt.service.js';
import { query } from '../db/pool.js';
import {
  getSession,
  getTurns,
  loadProductKnowledge,
  loadScenarioContext,
  setEvalStatus,
  type ScenarioContext,
  type TurnRow,
} from './session.service.js';
import { getAiConfig } from '../config/credentials.js';

/**
 * Evaluation Engine (Stage 7, PRD §33–§38, §63–§64).
 *
 * Guardrails are enforced in CODE, not just in the prompt:
 *   1. every competency score MUST carry non-empty `evidence` (else rejected),
 *   2. the weighted total is recomputed server-side from the stored rubric —
 *      the model's arithmetic is never trusted,
 *   3. invalid JSON is retried a bounded number of times, never persisted,
 *   4. the evaluation row pins ai_model + prompt_version_id (immutable, §67).
 */

export interface RubricCriterion {
  competency: string;
  weight: number;
  criteria: string | null;
  scoring_instruction: string | null;
  version: number;
}

/** Per-competency result as returned by the model. */
const competencySchema = z.object({
  competency: z.string().min(1),
  score: z.coerce.number().min(0).max(100),
  evidence: z.string().min(1, 'evidence wajib diisi'),
});

const evaluationSchema = z.object({
  competencies: z.array(competencySchema).min(1),
  strengths: z.array(z.string()).default([]),
  weaknesses: z.array(z.string()).default([]),
  critical_errors: z.array(z.string()).default([]),
  recommendation: z.string().default(''),
  confidence: z.coerce.number().min(0).max(1).default(0.5),
});

export type EvaluationPayload = z.infer<typeof evaluationSchema>;

export interface EvaluationResult {
  overall_score: number;
  passed: boolean;
  passing_score: number;
  competencies: Array<{ competency: string; score: number; weight: number; evidence: string; weighted: number }>;
  strengths: string[];
  weaknesses: string[];
  critical_errors: string[];
  recommendation: string;
  confidence: number;
  ai_model: string;
  prompt_version_id: number | null;
}

export async function loadRubric(moduleId: number): Promise<RubricCriterion[]> {
  const { rows } = await query<RubricCriterion>(
    `SELECT competency, weight, criteria, scoring_instruction, version
       FROM trainer_rubrics
      WHERE module_id = $1 AND active
      ORDER BY weight DESC`,
    [moduleId],
  );
  return rows;
}

function transcriptBlock(turns: TurnRow[]): string {
  if (turns.length === 0) return '(transkrip kosong)';
  return turns
    .map((t) => `${t.speaker === 'AI' ? 'CUSTOMER' : 'SALES'}: ${t.text ?? ''}`)
    .join('\n');
}

function rubricBlock(rubric: RubricCriterion[]): string {
  return rubric
    .map(
      (r) =>
        `- ${r.competency} (bobot ${r.weight}): ${r.criteria ?? ''}\n  Cara menilai: ${r.scoring_instruction ?? '-'}`,
    )
    .join('\n');
}

/**
 * Recompute the weighted total from the stored rubric. Competencies the model
 * returned that are not in the rubric are ignored; rubric rows the model skipped
 * score 0. This makes the final number impossible to inflate by prompt injection.
 */
export function computeWeightedScore(
  rubric: RubricCriterion[],
  scored: Array<{ competency: string; score: number }>,
): { total: number; detail: Array<{ competency: string; score: number; weight: number; weighted: number }> } {
  const byCompetency = new Map(scored.map((s) => [s.competency.toLowerCase(), s.score]));
  const totalWeight = rubric.reduce((sum, r) => sum + r.weight, 0);
  if (totalWeight === 0) return { total: 0, detail: [] };

  const detail = rubric.map((r) => {
    const score = byCompetency.get(r.competency.toLowerCase()) ?? 0;
    const weighted = (score * r.weight) / totalWeight;
    return { competency: r.competency, score, weight: r.weight, weighted };
  });

  const total = Math.round(detail.reduce((sum, d) => sum + d.weighted, 0));
  return { total, detail };
}

/** Validate that every rubric competency the model reported carries evidence. */
function assertEvidence(payload: EvaluationPayload): void {
  const missing = payload.competencies.filter((c) => !c.evidence || c.evidence.trim().length < 3);
  if (missing.length > 0) {
    throw new Error(
      `Guardrail: skor tanpa bukti ditolak untuk kompetensi: ${missing
        .map((m) => m.competency)
        .join(', ')}`,
    );
  }
}

const MAX_ATTEMPTS = 2;

/**
 * Run the evaluation for a finished session and persist it immutably.
 * Idempotent: if an evaluation already exists for the session it is returned.
 */
export async function evaluateSession(sessionId: number): Promise<EvaluationResult> {
  const existing = await loadEvaluation(sessionId);
  if (existing) return existing;

  const session = await getSession(sessionId);
  if (!session) throw new Error(`Sesi ${sessionId} tidak ditemukan.`);

  const scenario = await loadScenarioContext(session.scenario_id);

  const [turns, rubric, evalPrompt, productKnowledge, ai] = await Promise.all([
    getTurns(sessionId),
    loadRubric(scenario.module_id),
    getActivePrompt('evaluation'),
    loadProductKnowledge(scenario.product_category),
    getAiConfig(),
  ]);

  if (turns.length === 0) {
    throw new Error('Tidak bisa mengevaluasi sesi tanpa percakapan.');
  }
  if (rubric.length === 0) {
    throw new Error('Rubric untuk modul ini belum dikonfigurasi.');
  }

  const system = render(evalPrompt.content, {
    module_name: scenario.module_name,
    scenario_name: scenario.scenario_name,
    objective: scenario.objective ?? '',
    success_criteria: scenario.success_criteria ?? '',
    failure_criteria: scenario.failure_criteria ?? '',
    product_knowledge: productKnowledge,
    rubric: rubricBlock(rubric),
  });

  const user = [
    '=== RUBRIC BERBOBOT ===',
    rubricBlock(rubric),
    '',
    '=== TRANSKRIP PERCAKAPAN ===',
    transcriptBlock(turns),
    '',
    'Nilai SETIAP kompetensi di rubric. Setiap skor WAJIB menyertakan bukti kutipan',
    'dari transkrip. Balas HANYA JSON:',
    '{"competencies":[{"competency":"...","score":0-100,"evidence":"kutipan..."}],',
    ' "strengths":[], "weaknesses":[], "critical_errors":[], "recommendation":"...", "confidence":0-1}',
  ].join('\n');

  await setEvalStatus(sessionId, 'processing');

  let payload: EvaluationPayload | undefined;
  let lastError: unknown;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      const { data } = await chatJson<unknown>(
        [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
        {
          model: ai.modelEval,
          temperature: 0.1,
          maxTokens: 2500,
          timeoutMs: 120_000,
          jsonMode: true,
        },
      );
      const parsed = evaluationSchema.safeParse(data);
      if (!parsed.success) {
        throw new Error(
          `Skema evaluasi tidak valid: ${JSON.stringify(parsed.error.flatten().fieldErrors)}`,
        );
      }
      assertEvidence(parsed.data);
      payload = parsed.data;
      break;
    } catch (err) {
      lastError = err;
      console.warn(`[evaluasi] percobaan ${attempt}/${MAX_ATTEMPTS} gagal:`, (err as Error).message);
    }
  }

  if (!payload) {
    await setEvalStatus(sessionId, 'failed');
    throw new Error(
      `Evaluasi gagal setelah ${MAX_ATTEMPTS} percobaan: ${(lastError as Error)?.message ?? 'unknown'}`,
    );
  }

  const { total, detail } = computeWeightedScore(rubric, payload.competencies);
  const passed = total >= scenario.module_passing_score;

  // Persist immutably: pin model + prompt version so a later prompt edit cannot
  // retroactively change what this score meant (PRD §67).
  const { rows } = await query<{ id: number }>(
    `INSERT INTO trainer_evaluations
        (session_id, overall_score, status, feedback, strengths, weaknesses,
         critical_errors, recommendation, confidence, ai_model, prompt_version_id)
     VALUES ($1, $2, 'completed', $3::jsonb, $4, $5, $6, $7, $8, $9, $10)
     ON CONFLICT (session_id) DO NOTHING
     RETURNING id`,
    [
      sessionId,
      total,
      JSON.stringify({ competencies: detail, passed, passing_score: scenario.module_passing_score }),
      payload.strengths,
      payload.weaknesses,
      payload.critical_errors,
      payload.recommendation,
      payload.confidence,
      ai.modelEval,
      evalPrompt.id,
    ],
  );

  const evaluationId = rows[0]?.id;
  if (evaluationId) {
    for (const d of detail) {
      await query(
        `INSERT INTO trainer_competency_scores (evaluation_id, competency, score, weight, evidence)
         VALUES ($1, $2, $3, $4, $5)`,
        [
          evaluationId,
          d.competency,
          Math.round(d.score),
          d.weight,
          payload.competencies.find((c) => c.competency.toLowerCase() === d.competency.toLowerCase())
            ?.evidence ?? '',
        ],
      );
    }
  }

  await setEvalStatus(sessionId, 'completed');

  return {
    overall_score: total,
    passed,
    passing_score: scenario.module_passing_score,
    competencies: detail.map((d) => ({
      ...d,
      score: Math.round(d.score),
      weighted: Math.round(d.weighted * 100) / 100,
      evidence:
        payload.competencies.find((c) => c.competency.toLowerCase() === d.competency.toLowerCase())
          ?.evidence ?? '',
    })),
    strengths: payload.strengths,
    weaknesses: payload.weaknesses,
    critical_errors: payload.critical_errors,
    recommendation: payload.recommendation,
    confidence: payload.confidence,
    ai_model: ai.modelEval,
    prompt_version_id: evalPrompt.id,
  };
}

/** Load a stored evaluation (returns undefined when none exists yet). */
export async function loadEvaluation(sessionId: number): Promise<EvaluationResult | undefined> {
  const { rows } = await query<{
    overall_score: number | null;
    feedback: { passed?: boolean; passing_score?: number; competencies?: EvaluationResult['competencies'] } | null;
    strengths: string[] | null;
    weaknesses: string[] | null;
    critical_errors: string[] | null;
    recommendation: string | null;
    confidence: number | null;
    ai_model: string | null;
    prompt_version_id: number | null;
  }>(
    `SELECT overall_score, feedback, strengths, weaknesses, critical_errors,
            recommendation, confidence, ai_model, prompt_version_id
       FROM trainer_evaluations WHERE session_id = $1`,
    [sessionId],
  );
  const row = rows[0];
  if (!row) return undefined;

  return {
    overall_score: row.overall_score ?? 0,
    passed: row.feedback?.passed ?? false,
    passing_score: row.feedback?.passing_score ?? 80,
    competencies: row.feedback?.competencies ?? [],
    strengths: row.strengths ?? [],
    weaknesses: row.weaknesses ?? [],
    critical_errors: row.critical_errors ?? [],
    recommendation: row.recommendation ?? '',
    confidence: row.confidence ?? 0,
    ai_model: row.ai_model ?? '',
    prompt_version_id: row.prompt_version_id,
  };
}

/** Unused but kept for callers that want the raw scenario alongside a result. */
export type { ScenarioContext };
