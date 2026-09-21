import { pool } from '../db/pool.js';
import { HttpError } from '../middleware/error.middleware.js';
import { z } from 'zod';

export const FUNNEL_STAGES = [
  'TARGET',
  'CALL ATTEMPT',
  'CONNECTED',
  'GATEKEEPER',
  'GATEKEEPER PASSED',
  'PIC IDENTIFIED',
  'PIC CONTACT',
  'PIC CONVERSATION',
  'NEED IDENTIFIED',
  'OPPORTUNITY',
  'FOLLOW-UP',
  'QUOTATION',
  'ORDER',
  'REVENUE',
] as const;

export type FunnelStage = (typeof FUNNEL_STAGES)[number];

export const customerSchema = z.object({
  customer_code: z.string().min(1, 'Customer code is required'),
  name: z.string().min(1, 'Customer name is required'),
  type: z.string().default('B2G'),
  industry: z.string().optional(),
  organization: z.string().optional(),
  contact: z.record(z.any()).default({}),
  status: z.enum(['active', 'inactive']).default('active'),
  funnel_stage: z.enum(FUNNEL_STAGES).default('TARGET'),
});

export const callSchema = z.object({
  sales_id: z.number().int().positive(),
  customer_id: z.number().int().positive(),
  call_date: z.string().optional(),
  duration_seconds: z.number().int().nonnegative().default(0),
  audio_url: z.string().optional(),
  transcript: z.string().optional(),
  funnel_stage: z.enum(FUNNEL_STAGES).default('CALL ATTEMPT'),
  outcome: z.string().optional(),
});

export const whatsappSchema = z.object({
  sales_id: z.number().int().positive(),
  customer_id: z.number().int().positive(),
  conversation_date: z.string().optional(),
  messages: z.array(
    z.object({
      sender: z.string(),
      message: z.string(),
      timestamp: z.string().optional(),
    })
  ).default([]),
  outcome: z.string().optional(),
});

// ── Customer Service ──────────────────────────────────────────────────────────

export async function listCustomers(params: { search?: string; funnel_stage?: string; limit?: number; offset?: number }) {
  const limit = params.limit ?? 20;
  const offset = params.offset ?? 0;
  let sql = 'SELECT * FROM trainer_customers WHERE 1=1';
  const values: unknown[] = [];
  let idx = 1;

  if (params.search) {
    sql += ` AND (name ILIKE $${idx} OR customer_code ILIKE $${idx} OR organization ILIKE $${idx})`;
    values.push(`%${params.search}%`);
    idx++;
  }

  if (params.funnel_stage) {
    sql += ` AND funnel_stage = $${idx}`;
    values.push(params.funnel_stage);
    idx++;
  }

  sql += ` ORDER BY id DESC LIMIT $${idx} OFFSET $${idx + 1}`;
  values.push(limit, offset);

  const { rows } = await pool.query(sql, values);
  const count = await pool.query('SELECT COUNT(*) FROM trainer_customers');

  return {
    data: rows,
    pagination: {
      total: Number(count.rows[0].count),
      limit,
      offset,
    },
  };
}

export async function getCustomerById(id: number) {
  const { rows } = await pool.query('SELECT * FROM trainer_customers WHERE id = $1', [id]);
  if (rows.length === 0) throw new HttpError(404, 'Customer not found');
  return rows[0];
}

export async function createCustomer(data: z.infer<typeof customerSchema>) {
  const existing = await pool.query('SELECT id FROM trainer_customers WHERE customer_code = $1', [data.customer_code]);
  if (existing.rows.length > 0) {
    throw new HttpError(409, `Customer with code ${data.customer_code} already exists`);
  }

  const { rows } = await pool.query(
    `INSERT INTO trainer_customers (customer_code, name, type, industry, organization, contact, status, funnel_stage)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING *`,
    [
      data.customer_code,
      data.name,
      data.type ?? 'B2G',
      data.industry ?? null,
      data.organization ?? null,
      JSON.stringify(data.contact ?? {}),
      data.status ?? 'active',
      data.funnel_stage ?? 'TARGET',
    ]
  );
  return rows[0];
}

// ── Call Service ─────────────────────────────────────────────────────────────

export async function createCall(data: z.infer<typeof callSchema>) {
  const { rows } = await pool.query(
    `INSERT INTO trainer_calls (sales_id, customer_id, call_date, duration_seconds, audio_url, transcript, funnel_stage, outcome)
     VALUES ($1, $2, COALESCE($3, now()), $4, $5, $6, $7, $8)
     RETURNING *`,
    [
      data.sales_id,
      data.customer_id,
      data.call_date ?? null,
      data.duration_seconds ?? 0,
      data.audio_url ?? null,
      data.transcript ?? null,
      data.funnel_stage ?? 'CALL ATTEMPT',
      data.outcome ?? null,
    ]
  );

  // Update customer funnel stage to match latest call stage if advanced
  await pool.query('UPDATE trainer_customers SET funnel_stage = $1, updated_at = now() WHERE id = $2', [
    data.funnel_stage,
    data.customer_id,
  ]);

  return rows[0];
}

export async function getCallById(id: number) {
  const { rows } = await pool.query(
    `SELECT c.*, cust.name AS customer_name, cust.organization AS customer_org
     FROM trainer_calls c
     LEFT JOIN trainer_customers cust ON cust.id = c.customer_id
     WHERE c.id = $1`,
    [id]
  );
  if (rows.length === 0) throw new HttpError(404, 'Call not found');
  return rows[0];
}

export async function listCalls(params: { sales_id?: number; customer_id?: number; limit?: number; offset?: number }) {
  const limit = params.limit ?? 20;
  const offset = params.offset ?? 0;
  let sql = `SELECT c.*, cust.name as customer_name FROM trainer_calls c LEFT JOIN trainer_customers cust ON cust.id = c.customer_id WHERE 1=1`;
  const values: unknown[] = [];
  let idx = 1;

  if (params.sales_id) {
    sql += ` AND c.sales_id = $${idx}`;
    values.push(params.sales_id);
    idx++;
  }

  if (params.customer_id) {
    sql += ` AND c.customer_id = $${idx}`;
    values.push(params.customer_id);
    idx++;
  }

  sql += ` ORDER BY c.call_date DESC LIMIT $${idx} OFFSET $${idx + 1}`;
  values.push(limit, offset);

  const { rows } = await pool.query(sql, values);
  return rows;
}

// ── WhatsApp Service ─────────────────────────────────────────────────────────

export async function createWhatsAppConversation(data: z.infer<typeof whatsappSchema>) {
  const { rows } = await pool.query(
    `INSERT INTO trainer_whatsapp_conversations (sales_id, customer_id, conversation_date, messages, outcome)
     VALUES ($1, $2, COALESCE($3, now()), $4, $5)
     RETURNING *`,
    [
      data.sales_id,
      data.customer_id,
      data.conversation_date ?? null,
      JSON.stringify(data.messages ?? []),
      data.outcome ?? null,
    ]
  );
  return rows[0];
}

export async function getWhatsAppById(id: number) {
  const { rows } = await pool.query(
    `SELECT w.*, cust.name AS customer_name, cust.organization AS customer_org
     FROM trainer_whatsapp_conversations w
     LEFT JOIN trainer_customers cust ON cust.id = w.customer_id
     WHERE w.id = $1`,
    [id]
  );
  if (rows.length === 0) throw new HttpError(404, 'WhatsApp conversation not found');
  return rows[0];
}

// ── Funnel Overview ──────────────────────────────────────────────────────────

export async function getFunnelStats() {
  const { rows } = await pool.query(`
    SELECT funnel_stage, COUNT(*)::int AS count
    FROM trainer_customers
    GROUP BY funnel_stage
  `);

  const stageCounts: Record<string, number> = {};
  for (const stage of FUNNEL_STAGES) {
    stageCounts[stage] = 0;
  }
  for (const r of rows) {
    stageCounts[r.funnel_stage] = r.count;
  }

  return {
    stages: FUNNEL_STAGES,
    counts: stageCounts,
  };
}

// ── Import Architecture (CSV & JSON) ────────────────────────────────────────

export interface ImportPreviewItem {
  row: number;
  data: Record<string, unknown>;
  valid: boolean;
  duplicate: boolean;
  errors: string[];
}

export interface ImportResult {
  total: number;
  imported: number;
  skipped_duplicates: number;
  failed: number;
  errors: Array<{ row: number; reason: string }>;
}

export function parseCSV(csvContent: string): Array<Record<string, string>> {
  const lines = csvContent.trim().split(/\r?\n/).filter(Boolean);
  if (lines.length < 2 || !lines[0]) return [];

  const headers = lines[0].split(',').map((h) => h.trim().replace(/^"|"$/g, ''));
  const results: Array<Record<string, string>> = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;
    const cols = line.split(',').map((c) => c.trim().replace(/^"|"$/g, ''));
    const obj: Record<string, string> = {};
    headers.forEach((h, index) => {
      obj[h] = cols[index] ?? '';
    });
    results.push(obj);
  }
  return results;
}

export async function previewAndValidateCustomerImport(rawItems: Array<Record<string, unknown>>): Promise<{
  preview: ImportPreviewItem[];
  can_import_count: number;
  duplicate_count: number;
  invalid_count: number;
}> {
  const preview: ImportPreviewItem[] = [];
  let canImportCount = 0;
  let duplicateCount = 0;
  let invalidCount = 0;

  // Pre-load existing customer codes
  const existingCodesRes = await pool.query('SELECT customer_code FROM trainer_customers');
  const existingCodes = new Set(existingCodesRes.rows.map((r) => r.customer_code));

  for (let i = 0; i < rawItems.length; i++) {
    const item = rawItems[i];
    if (!item) continue;
    const errors: string[] = [];
    const code = String(item.customer_code ?? '').trim();
    const name = String(item.name ?? '').trim();

    if (!code) errors.push('Missing customer_code');
    if (!name) errors.push('Missing name');

    const isDuplicate = Boolean(code && existingCodes.has(code));
    const hasSchemaError = errors.length > 0;

    if (isDuplicate) errors.push(`Duplicate customer_code: ${code}`);

    if (hasSchemaError) invalidCount++;
    else if (isDuplicate) duplicateCount++;
    else canImportCount++;

    const isValid = !hasSchemaError && !isDuplicate;

    preview.push({
      row: i + 1,
      data: item,
      valid: isValid,
      duplicate: isDuplicate,
      errors,
    });
  }

  return {
    preview,
    can_import_count: canImportCount,
    duplicate_count: duplicateCount,
    invalid_count: invalidCount,
  };
}

export async function executeCustomerImport(rawItems: Array<Record<string, unknown>>): Promise<ImportResult> {
  const result: ImportResult = {
    total: rawItems.length,
    imported: 0,
    skipped_duplicates: 0,
    failed: 0,
    errors: [],
  };

  for (let i = 0; i < rawItems.length; i++) {
    const item = rawItems[i];
    if (!item) continue;
    try {
      const parsed = customerSchema.safeParse(item);
      if (!parsed.success) {
        result.failed++;
        result.errors.push({
          row: i + 1,
          reason: JSON.stringify(parsed.error.flatten().fieldErrors),
        });
        continue;
      }

      const existing = await pool.query('SELECT 1 FROM trainer_customers WHERE customer_code = $1', [
        parsed.data.customer_code,
      ]);
      if (existing.rows.length > 0) {
        result.skipped_duplicates++;
        continue;
      }

      await createCustomer(parsed.data);
      result.imported++;
    } catch (err) {
      result.failed++;
      result.errors.push({
        row: i + 1,
        reason: (err as Error).message,
      });
    }
  }

  return result;
}
