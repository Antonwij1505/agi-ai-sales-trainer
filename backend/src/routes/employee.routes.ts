import { Router } from 'express';
import { requireAuth } from '../middleware/auth.middleware.js';
import { requirePermission } from '../middleware/rbac.middleware.js';
import {
  createEmployee,
  deactivateEmployee,
  employeeInputSchema,
  listEmployees,
  updateEmployee,
} from '../services/employee.service.js';
import { HttpError } from '../middleware/error.middleware.js';

export const employeeRouter = Router();

employeeRouter.use(requireAuth);

employeeRouter.get('/employees', requirePermission('menu:sales'), async (req, res, next) => {
  try {
    const search = req.query.search as string | undefined;
    const status = req.query.status as string | undefined;
    const limit = req.query.limit ? Number(req.query.limit) : 20;
    const offset = req.query.offset ? Number(req.query.offset) : 0;

    const result = await listEmployees({ search, status, limit, offset });
    res.json({ success: true, ...result });
  } catch (err) {
    next(err);
  }
});

employeeRouter.post('/employees', requirePermission('action:create'), async (req, res, next) => {
  try {
    const parsed = employeeInputSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new HttpError(400, 'Invalid employee input', parsed.error.flatten());
    }
    const emp = await createEmployee(parsed.data);
    res.status(201).json({ success: true, employee: emp });
  } catch (err) {
    next(err);
  }
});

employeeRouter.patch('/employees/:id', requirePermission('action:update'), async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) throw new HttpError(400, 'Invalid employee ID');
    const emp = await updateEmployee(id, req.body);
    res.json({ success: true, employee: emp });
  } catch (err) {
    next(err);
  }
});

employeeRouter.delete('/employees/:id', requirePermission('action:delete'), async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) throw new HttpError(400, 'Invalid employee ID');
    const emp = await deactivateEmployee(id);
    res.json({ success: true, deactivated: emp });
  } catch (err) {
    next(err);
  }
});
