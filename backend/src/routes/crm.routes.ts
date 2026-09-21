import { Router } from 'express';
import { requireAuth } from '../middleware/auth.middleware.js';
import { requirePermission } from '../middleware/rbac.middleware.js';
import {
  callSchema,
  createCall,
  createCustomer,
  createWhatsAppConversation,
  customerSchema,
  executeCustomerImport,
  getCallById,
  getCustomerById,
  getFunnelStats,
  getWhatsAppById,
  listCalls,
  listCustomers,
  parseCSV,
  previewAndValidateCustomerImport,
  whatsappSchema,
} from '../services/crm.service.js';
import { HttpError } from '../middleware/error.middleware.js';

export const crmRouter = Router();

crmRouter.use(requireAuth);

// ── Customer Routes ──────────────────────────────────────────────────────────

crmRouter.get('/customers', requirePermission('menu:sales'), async (req, res, next) => {
  try {
    const search = req.query.search as string | undefined;
    const funnel_stage = req.query.funnel_stage as string | undefined;
    const limit = req.query.limit ? Number(req.query.limit) : 20;
    const offset = req.query.offset ? Number(req.query.offset) : 0;

    const result = await listCustomers({ search, funnel_stage, limit, offset });
    res.json({ success: true, ...result });
  } catch (err) {
    next(err);
  }
});

crmRouter.get('/customers/:id', requirePermission('menu:sales'), async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) throw new HttpError(400, 'Invalid customer ID');
    const customer = await getCustomerById(id);
    res.json({ success: true, customer });
  } catch (err) {
    next(err);
  }
});

crmRouter.post('/customers', requirePermission('action:create'), async (req, res, next) => {
  try {
    const parsed = customerSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new HttpError(400, 'Invalid customer data', parsed.error.flatten());
    }
    const customer = await createCustomer(parsed.data);
    res.status(201).json({ success: true, customer });
  } catch (err) {
    next(err);
  }
});

// ── Call & Transcript Routes ────────────────────────────────────────────────

crmRouter.get('/calls', requirePermission('menu:calls'), async (req, res, next) => {
  try {
    const sales_id = req.query.sales_id ? Number(req.query.sales_id) : undefined;
    const customer_id = req.query.customer_id ? Number(req.query.customer_id) : undefined;
    const limit = req.query.limit ? Number(req.query.limit) : 20;
    const offset = req.query.offset ? Number(req.query.offset) : 0;

    const calls = await listCalls({ sales_id, customer_id, limit, offset });
    res.json({ success: true, calls });
  } catch (err) {
    next(err);
  }
});

crmRouter.get('/calls/:id', requirePermission('menu:calls'), async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) throw new HttpError(400, 'Invalid call ID');
    const call = await getCallById(id);
    res.json({ success: true, call });
  } catch (err) {
    next(err);
  }
});

crmRouter.get('/calls/:id/transcript', requirePermission('menu:calls'), async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) throw new HttpError(400, 'Invalid call ID');
    const call = await getCallById(id);
    res.json({
      success: true,
      call_id: call.id,
      customer_id: call.customer_id,
      transcript: call.transcript ?? 'No transcript available',
      audio_url: call.audio_url,
    });
  } catch (err) {
    next(err);
  }
});

crmRouter.post('/calls', requirePermission('action:create'), async (req, res, next) => {
  try {
    const parsed = callSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new HttpError(400, 'Invalid call payload', parsed.error.flatten());
    }
    const call = await createCall(parsed.data);
    res.status(201).json({ success: true, call });
  } catch (err) {
    next(err);
  }
});

// ── WhatsApp Routes ──────────────────────────────────────────────────────────

crmRouter.get('/whatsapp/:id', requirePermission('menu:whatsapp'), async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) throw new HttpError(400, 'Invalid conversation ID');
    const conversation = await getWhatsAppById(id);
    res.json({ success: true, conversation });
  } catch (err) {
    next(err);
  }
});

crmRouter.post('/whatsapp', requirePermission('action:create'), async (req, res, next) => {
  try {
    const parsed = whatsappSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new HttpError(400, 'Invalid WhatsApp payload', parsed.error.flatten());
    }
    const conversation = await createWhatsAppConversation(parsed.data);
    res.status(201).json({ success: true, conversation });
  } catch (err) {
    next(err);
  }
});

// ── Funnel Overview Route ───────────────────────────────────────────────────

crmRouter.get('/funnel/stats', requirePermission('menu:sales'), async (_req, res, next) => {
  try {
    const stats = await getFunnelStats();
    res.json({ success: true, ...stats });
  } catch (err) {
    next(err);
  }
});

// ── Import Architecture Routes ──────────────────────────────────────────────

crmRouter.post('/import/preview', requirePermission('action:create'), async (req, res, next) => {
  try {
    const { format, content } = req.body;
    let items: Array<Record<string, unknown>> = [];

    if (format === 'csv' && typeof content === 'string') {
      items = parseCSV(content);
    } else if (format === 'json' && Array.isArray(content)) {
      items = content;
    } else {
      throw new HttpError(400, 'Invalid import format. Use format="csv" with text or format="json" with array');
    }

    const preview = await previewAndValidateCustomerImport(items);
    res.json({ success: true, ...preview });
  } catch (err) {
    next(err);
  }
});

crmRouter.post('/import/execute', requirePermission('action:create'), async (req, res, next) => {
  try {
    const { format, content } = req.body;
    let items: Array<Record<string, unknown>> = [];

    if (format === 'csv' && typeof content === 'string') {
      items = parseCSV(content);
    } else if (format === 'json' && Array.isArray(content)) {
      items = content;
    } else {
      throw new HttpError(400, 'Invalid import format. Use format="csv" with text or format="json" with array');
    }

    const result = await executeCustomerImport(items);
    res.json({ success: true, result });
  } catch (err) {
    next(err);
  }
});
