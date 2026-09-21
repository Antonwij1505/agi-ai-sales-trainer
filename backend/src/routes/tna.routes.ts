import { Router } from 'express';
import { requireAuth } from '../middleware/auth.middleware.js';
import { requirePermission } from '../middleware/rbac.middleware.js';
import { generateIndividualTNA, getTeamTNAOverview, listTNAResults } from '../services/tna.service.js';
import { HttpError } from '../middleware/error.middleware.js';

export const tnaRouter = Router();

tnaRouter.use(requireAuth);

tnaRouter.get('/tna/individual/:sales_id', requirePermission('menu:tna'), async (req, res, next) => {
  try {
    const salesId = Number(req.params.sales_id);
    if (!Number.isInteger(salesId) || salesId <= 0) throw new HttpError(400, 'Invalid sales ID');

    const result = await generateIndividualTNA(salesId);
    res.json({ success: true, ...result });
  } catch (err) {
    next(err);
  }
});

tnaRouter.get('/tna/team', requirePermission('menu:tna'), async (_req, res, next) => {
  try {
    const result = await getTeamTNAOverview();
    res.json({ success: true, ...result });
  } catch (err) {
    next(err);
  }
});

tnaRouter.get('/tna', requirePermission('menu:tna'), async (req, res, next) => {
  try {
    const sales_id = req.query.sales_id ? Number(req.query.sales_id) : undefined;
    const priority_level = req.query.priority_level as string | undefined;

    const list = await listTNAResults({ sales_id, priority_level });
    res.json({ success: true, tna_results: list });
  } catch (err) {
    next(err);
  }
});
