import { pool } from '../db/pool.js';
import { HttpError } from '../middleware/error.middleware.js';
import { z } from 'zod';

export const trainingCatalogSchema = z.object({
  title: z.string().min(1, 'Title required'),
  objective: z.string().optional(),
  competency: z.string().min(1, 'Competency required'),
  level: z.string().default('Level 1'),
  duration_minutes: z.number().int().default(60),
  material: z.string().optional(),
  examples: z.string().optional(),
  case_study: z.string().optional(),
  roleplay: z.string().optional(),
  exercise: z.string().optional(),
  quiz: z.array(z.any()).default([]),
  passing_score: z.number().int().default(80),
  month_roadmap: z.number().int().optional(),
});

export const assessmentSchema = z.object({
  sales_id: z.number().int().positive(),
  catalog_id: z.number().int().positive(),
  type: z.enum(['pre-test', 'post-test', 'practical', 'roleplay']),
  score: z.number().min(0).max(100),
  feedback: z.string().optional(),
});

export const coachingLogSchema = z.object({
  employee_id: z.number().int().positive(),
  coach_id: z.number().int().positive(),
  problem: z.string().min(1, 'Problem description required'),
  evidence: z.string().optional(),
  root_cause: z.string().optional(),
  action: z.string().optional(),
  deadline: z.string().optional(),
  follow_up_date: z.string().optional(),
  result: z.string().optional(),
  status: z.enum(['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED']).default('OPEN'),
});

// ── Training Catalog Services ──────────────────────────────────────────────

export async function listTrainingModules() {
  const { rows } = await pool.query('SELECT * FROM trainer_training_catalog ORDER BY month_roadmap ASC, id ASC');
  return rows;
}

export async function createTrainingModule(data: z.infer<typeof trainingCatalogSchema>) {
  const { rows } = await pool.query(
    `INSERT INTO trainer_training_catalog (title, objective, competency, level, duration_minutes, material, examples, case_study, roleplay, exercise, quiz, passing_score, month_roadmap)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
     RETURNING *`,
    [
      data.title,
      data.objective ?? null,
      data.competency,
      data.level ?? 'Level 1',
      data.duration_minutes ?? 60,
      data.material ?? null,
      data.examples ?? null,
      data.case_study ?? null,
      data.roleplay ?? null,
      data.exercise ?? null,
      JSON.stringify(data.quiz ?? []),
      data.passing_score ?? 80,
      data.month_roadmap ?? null,
    ]
  );
  return rows[0];
}

export async function getRoadmapOverview() {
  const { rows } = await pool.query(`
    SELECT month_roadmap, title, competency, level
    FROM trainer_training_catalog
    WHERE month_roadmap IS NOT NULL
    ORDER BY month_roadmap ASC
  `);
  return rows;
}

// ── Assessment Services ─────────────────────────────────────────────────────

export async function recordAssessment(data: z.infer<typeof assessmentSchema>) {
  // Get passing score from catalog
  const catRes = await pool.query('SELECT passing_score FROM trainer_training_catalog WHERE id = $1', [data.catalog_id]);
  const passingScore = catRes.rows[0]?.passing_score ?? 80;
  const passed = data.score >= passingScore;

  const { rows } = await pool.query(
    `INSERT INTO trainer_assessments (sales_id, catalog_id, type, score, passed, feedback)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [data.sales_id, data.catalog_id, data.type, data.score, passed, data.feedback ?? null]
  );
  return rows[0];
}

// ── Coaching Log Services ───────────────────────────────────────────────────

export async function createCoachingLog(data: z.infer<typeof coachingLogSchema>) {
  const { rows } = await pool.query(
    `INSERT INTO trainer_coaching_logs (employee_id, coach_id, problem, evidence, root_cause, action, deadline, follow_up_date, result, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     RETURNING *`,
    [
      data.employee_id,
      data.coach_id,
      data.problem,
      data.evidence ?? null,
      data.root_cause ?? null,
      data.action ?? null,
      data.deadline ?? null,
      data.follow_up_date ?? null,
      data.result ?? null,
      data.status ?? 'OPEN',
    ]
  );
  return rows[0];
}

export async function listCoachingLogs(employeeId?: number) {
  let sql = 'SELECT * FROM trainer_coaching_logs WHERE 1=1';
  const values: unknown[] = [];
  if (employeeId) {
    sql += ' AND employee_id = $1';
    values.push(employeeId);
  }
  sql += ' ORDER BY id DESC';
  const { rows } = await pool.query(sql, values);
  return rows;
}

// ── Training Effectiveness Calculation ─────────────────────────────────────

export function calculateEffectivenessCategory(overallScore: number): string {
  if (overallScore >= 80) return 'Highly Effective';
  if (overallScore >= 70) return 'Effective';
  if (overallScore >= 60) return 'Partially Effective';
  return 'Ineffective';
}

export async function calculateAndSaveEffectiveness(input: {
  sales_id: number;
  catalog_id: number;
  knowledge_improvement: number; // 0-100
  behavior_improvement: number;  // 0-100
  business_impact_score: number; // 0-100
  evaluation_stage?: 'T0' | 'T1' | 'T2' | 'T3' | 'T4' | 'T5';
}) {
  const knowledgeWeight = 0.3;
  const behaviorWeight = 0.3;
  const businessWeight = 0.4;

  const overall =
    input.knowledge_improvement * knowledgeWeight +
    input.behavior_improvement * behaviorWeight +
    input.business_impact_score * businessWeight;

  const roundedOverall = Math.round(overall * 100) / 100;
  const category = calculateEffectivenessCategory(roundedOverall);
  const stage = input.evaluation_stage ?? 'T0';

  const { rows } = await pool.query(
    `INSERT INTO trainer_effectiveness_evaluations (sales_id, catalog_id, knowledge_improvement, behavior_improvement, business_impact_score, overall_effectiveness, category, evaluation_stage)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING *`,
    [
      input.sales_id,
      input.catalog_id,
      input.knowledge_improvement,
      input.behavior_improvement,
      input.business_impact_score,
      roundedOverall,
      category,
      stage,
    ]
  );

  return rows[0];
}
