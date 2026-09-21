import { pool } from '../db/pool.js';
import { HttpError } from '../middleware/error.middleware.js';

export interface TNAFormulaWeights {
  gap_weight: number;
  error_freq_weight: number;
  business_impact_weight: number;
  severity_weight: number;
}

export function calculateTNAPriorityScore(
  gap: number,
  errorFreq: number,
  businessImpact: number,
  severity: number,
  weights: TNAFormulaWeights = { gap_weight: 0.4, error_freq_weight: 0.2, business_impact_weight: 0.2, severity_weight: 0.2 }
): { priority_score: number; priority_level: 'HIGH' | 'MEDIUM' | 'LOW' } {
  // Normalize inputs to 0-100 scale
  const normGap = Math.min(100, Math.max(0, (gap / 40) * 100));
  const normFreq = Math.min(100, Math.max(0, (errorFreq / 5) * 100));
  const normImpact = Math.min(100, Math.max(0, (businessImpact / 5) * 100));
  const normSeverity = Math.min(100, Math.max(0, (severity / 5) * 100));

  const score =
    normGap * weights.gap_weight +
    normFreq * weights.error_freq_weight +
    normImpact * weights.business_impact_weight +
    normSeverity * weights.severity_weight;

  const rounded = Math.round(score * 100) / 100;
  let level: 'HIGH' | 'MEDIUM' | 'LOW' = 'LOW';
  if (rounded >= 55) level = 'HIGH';
  else if (rounded >= 30) level = 'MEDIUM';

  return { priority_score: rounded, priority_level: level };
}

export async function generateIndividualTNA(salesId: number, targetScore: number = 75) {
  // Fetch latest AI Analyses for this sales_id
  const { rows: analyses } = await pool.query(
    `SELECT * FROM trainer_ai_analyses WHERE sales_id = $1 ORDER BY id DESC LIMIT 10`,
    [salesId]
  );

  const competencyScores: Record<string, { total: number; count: number; errors: number; evidence: unknown[] }> = {};

  for (const a of analyses) {
    const payload = a.analysis_payload;
    if (payload?.competencies && Array.isArray(payload.competencies)) {
      for (const comp of payload.competencies) {
        const name = comp.competency;
        if (!competencyScores[name]) {
          competencyScores[name] = { total: 0, count: 0, errors: 0, evidence: [] };
        }

        competencyScores[name].total += comp.score;
        competencyScores[name].count += 1;
        if (comp.score < 70) {
          competencyScores[name].errors += 1;
          competencyScores[name].evidence.push({
            analysis_id: a.id,
            score: comp.score,
            reason: comp.reason,
            classification: comp.context_classification,
          });
        }
      }
    }
  }

  // Fetch competency definitions from DB
  const { rows: defs } = await pool.query('SELECT * FROM trainer_competency_definitions WHERE active = true');

  const results: unknown[] = [];

  for (const def of defs) {
    const compName = def.name;
    const stat = competencyScores[compName];
    const currentScore = stat && stat.count > 0 ? Math.round(stat.total / stat.count) : 60;
    const gap = Math.max(0, targetScore - currentScore);
    const errorFreq = stat ? stat.errors : 1;
    const severity = gap > 20 ? 4 : gap > 10 ? 3 : 2;
    const businessImpact = def.critical_threshold >= 70 ? 5 : 3;

    const { priority_score, priority_level } = calculateTNAPriorityScore(gap, errorFreq, businessImpact, severity);

    let recommendedTraining = `${compName} Level 1`;
    let recommendedPractice = `Roleplay practice for ${compName}`;

    if (compName.toLowerCase().includes('gatekeeper')) {
      recommendedTraining = 'Gatekeeper Handling Level 2';
      recommendedPractice = 'Roleplay: CS refuses to provide PIC contact';
    } else if (compName.toLowerCase().includes('objection')) {
      recommendedTraining = 'Objection Handling & Budget Justification';
      recommendedPractice = 'Roleplay: Handling B2G budget freeze objection';
    }

    const item = {
      sales_id: salesId,
      competency: compName,
      current_score: currentScore,
      target_score: targetScore,
      gap,
      error_frequency: errorFreq,
      severity,
      business_impact: businessImpact,
      priority_score,
      priority_level,
      recommended_training: recommendedTraining,
      recommended_practice: recommendedPractice,
      evidence_references: stat?.evidence ?? [],
    };

    // Save TNA result to DB
    await pool.query(
      `INSERT INTO trainer_tna_results (sales_id, competency, current_score, target_score, gap, error_frequency, severity, business_impact, priority_score, priority_level, recommended_training, recommended_practice, evidence_references)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
      [
        salesId,
        compName,
        currentScore,
        targetScore,
        gap,
        errorFreq,
        severity,
        businessImpact,
        priority_score,
        priority_level,
        recommendedTraining,
        recommendedPractice,
        JSON.stringify(stat?.evidence ?? []),
      ]
    );

    results.push(item);
  }

  return { sales_id: salesId, tna: results };
}

export async function getTeamTNAOverview() {
  const { rows } = await pool.query(`
    SELECT competency,
           ROUND(AVG(current_score), 2) AS avg_current_score,
           ROUND(AVG(gap), 2) AS avg_gap,
           ROUND(AVG(priority_score), 2) AS avg_priority_score,
           SUM(error_frequency)::int AS total_errors,
           COUNT(DISTINCT sales_id)::int AS sales_count
    FROM trainer_tna_results
    GROUP BY competency
    ORDER BY avg_priority_score DESC
  `);

  const teamWideProblems = rows.filter((r) => Number(r.avg_gap) > 15 || Number(r.avg_priority_score) >= 50);
  const individualProblems = rows.filter((r) => Number(r.avg_gap) <= 15 && Number(r.avg_priority_score) < 50);

  return {
    overview: rows,
    team_wide_problems: teamWideProblems.map((p) => p.competency),
    individual_problems: individualProblems.map((p) => p.competency),
  };
}

export async function listTNAResults(params: { sales_id?: number; priority_level?: string }) {
  let sql = 'SELECT * FROM trainer_tna_results WHERE 1=1';
  const values: unknown[] = [];
  let idx = 1;

  if (params.sales_id) {
    sql += ` AND sales_id = $${idx}`;
    values.push(params.sales_id);
    idx++;
  }

  if (params.priority_level) {
    sql += ` AND priority_level = $${idx}`;
    values.push(params.priority_level);
    idx++;
  }

  sql += ' ORDER BY priority_score DESC, id DESC';
  const { rows } = await pool.query(sql, values);
  return rows;
}
