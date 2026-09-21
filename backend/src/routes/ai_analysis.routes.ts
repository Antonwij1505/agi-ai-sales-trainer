import { Router } from 'express';
import { requireAuth } from '../middleware/auth.middleware.js';
import { requirePermission } from '../middleware/rbac.middleware.js';
import {
  applyHumanReviewOverride,
  executeCallAnalysis,
  executeWhatsAppAnalysis,
  getAnalysisById,
  listAnalyses,
} from '../services/ai_engine.service.js';
import { HttpError } from '../middleware/error.middleware.js';

export const aiAnalysisRouter = Router();

aiAnalysisRouter.use(requireAuth);

aiAnalysisRouter.post('/ai-analysis/call/:id', requirePermission('action:ai_execute'), async (req, res, next) => {
  try {
    const callId = Number(req.params.id);
    if (!Number.isInteger(callId) || callId <= 0) throw new HttpError(400, 'Invalid call ID');
    const result = await executeCallAnalysis(callId);
    res.status(201).json({ success: true, analysis: result });
  } catch (err) {
    next(err);
  }
});

aiAnalysisRouter.post('/ai-analysis/whatsapp/:id', requirePermission('action:ai_execute'), async (req, res, next) => {
  try {
    const waId = Number(req.params.id);
    if (!Number.isInteger(waId) || waId <= 0) throw new HttpError(400, 'Invalid WhatsApp conversation ID');
    const result = await executeWhatsAppAnalysis(waId);
    res.status(201).json({ success: true, analysis: result });
  } catch (err) {
    next(err);
  }
});

aiAnalysisRouter.get('/ai-analysis', requirePermission('menu:ai_analysis'), async (req, res, next) => {
  try {
    const sales_id = req.query.sales_id ? Number(req.query.sales_id) : undefined;
    const type = req.query.type as string | undefined;
    const status = req.query.status as string | undefined;

    const list = await listAnalyses({ sales_id, type, status });
    res.json({ success: true, analyses: list });
  } catch (err) {
    next(err);
  }
});

aiAnalysisRouter.get('/ai-analysis/:id', requirePermission('menu:ai_analysis'), async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) throw new HttpError(400, 'Invalid analysis ID');
    const analysis = await getAnalysisById(id);
    res.json({ success: true, analysis });
  } catch (err) {
    next(err);
  }
});

aiAnalysisRouter.post('/ai-analysis/:id/override', requirePermission('action:update'), async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) throw new HttpError(400, 'Invalid analysis ID');

    const { override_overall_score, manager_notes } = req.body;
    if (!manager_notes) {
      throw new HttpError(400, 'Manager notes required for human review override');
    }

    const updated = await applyHumanReviewOverride(id, {
      reviewed_by: req.user?.username ?? 'manager',
      override_overall_score: override_overall_score ? Number(override_overall_score) : undefined,
      manager_notes: String(manager_notes),
    });

    res.json({ success: true, overridden: updated });
  } catch (err) {
    next(err);
  }
});
