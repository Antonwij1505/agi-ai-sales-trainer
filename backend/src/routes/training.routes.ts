import { Router } from 'express';
import { requireAuth } from '../middleware/auth.middleware.js';
import { requirePermission } from '../middleware/rbac.middleware.js';
import {
  assessmentSchema,
  calculateAndSaveEffectiveness,
  coachingLogSchema,
  createCoachingLog,
  createTrainingModule,
  getRoadmapOverview,
  listCoachingLogs,
  listTrainingModules,
  recordAssessment,
  trainingCatalogSchema,
} from '../services/training_management.service.js';
import { HttpError } from '../middleware/error.middleware.js';

export const trainingRouter = Router();

trainingRouter.use(requireAuth);

// ── Modules & Roadmap ───────────────────────────────────────────────────────

trainingRouter.get('/training/modules', requirePermission('menu:training'), async (_req, res, next) => {
  try {
    const modules = await listTrainingModules();
    res.json({ success: true, modules });
  } catch (err) {
    next(err);
  }
});

trainingRouter.post('/training/modules', requirePermission('action:create'), async (req, res, next) => {
  try {
    const parsed = trainingCatalogSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new HttpError(400, 'Invalid training module data', parsed.error.flatten());
    }
    const module = await createTrainingModule(parsed.data);
    res.status(201).json({ success: true, module });
  } catch (err) {
    next(err);
  }
});

trainingRouter.get('/training/roadmap', requirePermission('menu:training'), async (_req, res, next) => {
  try {
    const roadmap = await getRoadmapOverview();
    res.json({ success: true, roadmap });
  } catch (err) {
    next(err);
  }
});

// ── Assessments ─────────────────────────────────────────────────────────────

trainingRouter.post('/training/assessments', requirePermission('action:create'), async (req, res, next) => {
  try {
    const parsed = assessmentSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new HttpError(400, 'Invalid assessment data', parsed.error.flatten());
    }
    const assessment = await recordAssessment(parsed.data);
    res.status(201).json({ success: true, assessment });
  } catch (err) {
    next(err);
  }
});

// ── Coaching Logs ───────────────────────────────────────────────────────────

trainingRouter.get('/coaching', requirePermission('menu:coaching'), async (req, res, next) => {
  try {
    const employee_id = req.query.employee_id ? Number(req.query.employee_id) : undefined;
    const logs = await listCoachingLogs(employee_id);
    res.json({ success: true, coaching_logs: logs });
  } catch (err) {
    next(err);
  }
});

trainingRouter.post('/coaching', requirePermission('action:create'), async (req, res, next) => {
  try {
    const parsed = coachingLogSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new HttpError(400, 'Invalid coaching log data', parsed.error.flatten());
    }
    const log = await createCoachingLog(parsed.data);
    res.status(201).json({ success: true, coaching_log: log });
  } catch (err) {
    next(err);
  }
});

// ── Training Effectiveness ─────────────────────────────────────────────────

trainingRouter.post('/training/effectiveness', requirePermission('action:create'), async (req, res, next) => {
  try {
    const { sales_id, catalog_id, knowledge_improvement, behavior_improvement, business_impact_score, evaluation_stage } = req.body;

    if (!sales_id || !catalog_id) {
      throw new HttpError(400, 'sales_id and catalog_id are required');
    }

    const evaluation = await calculateAndSaveEffectiveness({
      sales_id: Number(sales_id),
      catalog_id: Number(catalog_id),
      knowledge_improvement: Number(knowledge_improvement ?? 0),
      behavior_improvement: Number(behavior_improvement ?? 0),
      business_impact_score: Number(business_impact_score ?? 0),
      evaluation_stage: evaluation_stage,
    });

    res.status(201).json({ success: true, evaluation });
  } catch (err) {
    next(err);
  }
});
