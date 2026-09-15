import { Router } from 'express';

import { query } from '../db/pool.js';
import { HttpError } from '../middleware/error.middleware.js';
import { requireAuth } from '../middleware/auth.middleware.js';

export const catalogRouter = Router();

/**
 * GET /api/trainer/modules
 * Active modules with their scenario counts. Sales see the catalog read-only.
 */
catalogRouter.get('/modules', requireAuth, async (_req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT m.id, m.code, m.name, m.description, m.category, m.difficulty,
              m.passing_score, m.max_attempt, m.status, m.version,
              (SELECT count(*) FROM trainer_scenarios s
                WHERE s.module_id = m.id AND s.active) AS scenario_count
         FROM trainer_modules m
        WHERE m.active
        ORDER BY m.code`,
    );
    res.json({ success: true, count: rows.length, modules: rows });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/trainer/modules/:id
 * Module detail with active scenarios (persona joined) and weighted rubric.
 */
catalogRouter.get('/modules/:id', requireAuth, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      throw new HttpError(400, 'module id tidak valid.');
    }

    const { rows: mods } = await query(
      `SELECT id, code, name, description, category, difficulty,
              passing_score, max_attempt, status, version
         FROM trainer_modules WHERE id = $1 AND active`,
      [id],
    );
    const mod = mods[0];
    if (!mod) throw new HttpError(404, 'Module tidak ditemukan.');

    const { rows: scenarios } = await query(
      `SELECT s.id, s.name, s.description, s.difficulty, s.resistance_level,
              s.product_category, s.institution_type, s.objective,
              s.success_criteria, s.failure_criteria, s.rup_context_required,
              p.id AS persona_id, p.name AS persona_name, p.type AS persona_type,
              p.role AS persona_role, p.attitude AS persona_attitude,
              p.communication_style AS persona_communication_style,
              p.default_resistance AS persona_default_resistance
         FROM trainer_scenarios s
         LEFT JOIN trainer_personas p ON p.id = s.persona_id
        WHERE s.module_id = $1 AND s.active
        ORDER BY s.id`,
      [id],
    );

    const { rows: rubric } = await query(
      `SELECT competency, weight, criteria, scoring_instruction, version
         FROM trainer_rubrics
        WHERE module_id = $1 AND active
        ORDER BY weight DESC`,
      [id],
    );

    res.json({ success: true, module: mod, scenarios, rubric });
  } catch (err) {
    next(err);
  }
});
