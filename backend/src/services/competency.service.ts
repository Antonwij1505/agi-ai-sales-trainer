import { pool } from '../db/pool.js';
import { HttpError } from '../middleware/error.middleware.js';

export function calculateGrade(score: number): string {
  if (score >= 90) return 'A';
  if (score >= 80) return 'B';
  if (score >= 70) return 'C';
  if (score >= 60) return 'D';
  return 'E';
}

export async function getCompetencyDefinitions() {
  const { rows } = await pool.query('SELECT * FROM trainer_competency_definitions WHERE active = true ORDER BY id ASC');
  return rows;
}

export async function calculateSessionCompetencyScores(evaluationId: number) {
  const { rows: defs } = await pool.query('SELECT * FROM trainer_competency_definitions WHERE active = true');
  const { rows: scores } = await pool.query(
    'SELECT * FROM trainer_competency_scores WHERE evaluation_id = $1',
    [evaluationId]
  );

  let totalWeightedScore = 0;
  let totalWeight = 0;
  const competencyDetails: Array<unknown> = [];
  const criticalFailures: Array<string> = [];

  for (const d of defs) {
    const match = scores.find((s) => s.competency.toLowerCase() === d.name.toLowerCase());
    const scoreVal = match ? Number(match.score) : 0;
    const weightVal = Number(d.weight);

    totalWeightedScore += scoreVal * (weightVal / 100);
    totalWeight += weightVal;

    if (scoreVal < d.critical_threshold) {
      criticalFailures.push(`${d.name} score (${scoreVal}) is below critical threshold (${d.critical_threshold})`);
    }

    competencyDetails.push({
      competency: d.name,
      score: scoreVal,
      weight: weightVal,
      critical_threshold: d.critical_threshold,
      passed_threshold: scoreVal >= d.critical_threshold,
      evidence: match?.evidence ?? null,
    });
  }

  const overallScore = Math.round(totalWeightedScore);
  const grade = calculateGrade(overallScore);

  return {
    overall_score: overallScore,
    grade,
    total_weight: totalWeight,
    critical_failures: criticalFailures,
    is_critical_pass: criticalFailures.length === 0,
    competencies: competencyDetails,
  };
}

export async function getEmployeeCompetencyProfile(salesId: number) {
  // Check employee
  const empRes = await pool.query('SELECT * FROM trainer_employees WHERE user_id = $1 OR id = $2', [salesId, salesId]);
  const employee = empRes.rows[0] ?? { id: salesId, name: `Sales #${salesId}` };

  // Get historical sessions & evaluations for this sales_id
  const { rows: sessions } = await pool.query(
    `SELECT s.id AS session_id, s.created_at, s.attempt, sc.name AS scenario_name,
            e.overall_score, e.strengths, e.weaknesses, e.critical_errors
     FROM trainer_sessions s
     LEFT JOIN trainer_scenarios sc ON sc.id = s.scenario_id
     LEFT JOIN trainer_evaluations e ON e.session_id = s.id
     WHERE s.sales_id = $1 AND s.status = 'completed'
     ORDER BY s.created_at DESC`,
    [salesId]
  );

  const latestEval = sessions.find((s) => s.overall_score != null);
  let latestScores = null;
  if (latestEval) {
    latestScores = await calculateSessionCompetencyScores(latestEval.session_id);
  }

  // Historical trend
  const historicalTrend = sessions.map((s) => ({
    session_id: s.session_id,
    date: s.created_at,
    scenario: s.scenario_name,
    score: s.overall_score,
  }));

  return {
    employee,
    overall_score: latestScores?.overall_score ?? 0,
    grade: latestScores?.grade ?? 'E',
    is_critical_pass: latestScores?.is_critical_pass ?? true,
    critical_failures: latestScores?.critical_failures ?? [],
    strengths: latestEval?.strengths ?? [],
    weaknesses: latestEval?.weaknesses ?? [],
    competencies: latestScores?.competencies ?? [],
    historical_trend: historicalTrend,
  };
}
