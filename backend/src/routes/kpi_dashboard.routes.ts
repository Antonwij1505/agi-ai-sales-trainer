import { Router } from 'express';
import { requireAuth } from '../middleware/auth.middleware.js';
import { requirePermission } from '../middleware/rbac.middleware.js';
import {
  exportReportCSV,
  getManagementDashboard,
  getSalesIndividualDashboard,
  getSalesKPIs,
  getSalesManagerDashboard,
} from '../services/kpi_dashboard.service.js';
import { HttpError } from '../middleware/error.middleware.js';

export const kpiDashboardRouter = Router();

kpiDashboardRouter.use(requireAuth);

// ── KPI Summary ─────────────────────────────────────────────────────────────

kpiDashboardRouter.get('/kpi/summary', requirePermission('menu:kpi'), async (req, res, next) => {
  try {
    const sales_id = req.query.sales_id ? Number(req.query.sales_id) : undefined;
    const period = (req.query.period as any) ?? 'monthly';

    const kpi = await getSalesKPIs(sales_id, period);
    res.json({ success: true, ...kpi });
  } catch (err) {
    next(err);
  }
});

// ── Management Dashboard ────────────────────────────────────────────────────

kpiDashboardRouter.get('/dashboard/management', requirePermission('menu:reports'), async (_req, res, next) => {
  try {
    const dashboard = await getManagementDashboard();
    res.json({ success: true, dashboard });
  } catch (err) {
    next(err);
  }
});

// ── Sales Manager Dashboard ─────────────────────────────────────────────────

kpiDashboardRouter.get('/dashboard/manager', requirePermission('menu:reports'), async (_req, res, next) => {
  try {
    const dashboard = await getSalesManagerDashboard();
    res.json({ success: true, dashboard });
  } catch (err) {
    next(err);
  }
});

// ── Sales Individual Dashboard ──────────────────────────────────────────────

kpiDashboardRouter.get('/dashboard/sales/:sales_id', requirePermission('menu:dashboard'), async (req, res, next) => {
  try {
    const targetSalesId = Number(req.params.sales_id);
    if (!Number.isInteger(targetSalesId) || targetSalesId <= 0) {
      throw new HttpError(400, 'Invalid sales ID');
    }

    // RBAC: Sales users can only access their own dashboard unless manager/admin
    const userRole = req.user?.role;
    const userId = req.user?.sub;

    if (userRole === 'sales' && userId !== targetSalesId) {
      throw new HttpError(403, 'Forbidden — sales reps can only access their own personal dashboard');
    }

    const dashboard = await getSalesIndividualDashboard(targetSalesId);
    res.json({ success: true, dashboard });
  } catch (err) {
    next(err);
  }
});

// ── Reports Export (CSV) ────────────────────────────────────────────────────

kpiDashboardRouter.get('/reports/export', requirePermission('menu:reports'), async (req, res, next) => {
  try {
    const period = (req.query.period as any) ?? 'monthly';
    const csvContent = await exportReportCSV(period);

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=kpi_report_${period}.csv`);
    res.send(csvContent);
  } catch (err) {
    next(err);
  }
});
