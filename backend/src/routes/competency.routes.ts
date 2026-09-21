import { Router } from 'express';
import { requireAuth } from '../middleware/auth.middleware.js';
import { requirePermission } from '../middleware/rbac.middleware.js';
import {
  getCompetencyDefinitions,
  getEmployeeCompetencyProfile,
} from '../services/competency.service.js';
import { HttpError } from '../middleware/error.middleware.js';

export const competencyRouter = Router();

competencyRouter.use(requireAuth);

competencyRouter.get('/competencies/definitions', requirePermission('menu:competency'), async (_req, res, next) => {
  try {
    const defs = await getCompetencyDefinitions();
    const totalWeight = defs.reduce((sum, d) => sum + Number(d.weight), 0);
    res.json({ success: true, total_weight: totalWeight, definitions: defs });
  } catch (err) {
    next(err);
  }
});

competencyRouter.get('/sales/:id/competency', requirePermission('menu:competency'), async (req, res, next) => {
  try {
    const salesId = Number(req.params.id);
    if (!Number.isInteger(salesId) || salesId <= 0) {
      throw new HttpError(400, 'Invalid sales ID');
    }
    const profile = await getEmployeeCompetencyProfile(salesId);
    res.json({ success: true, profile });
  } catch (err) {
    next(err);
  }
});
