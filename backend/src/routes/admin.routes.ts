import { Router } from 'express';

import { HttpError } from '../middleware/error.middleware.js';
import { requireAdmin } from '../middleware/auth.middleware.js';
import {
  createPersona,
  createScenario,
  deactivateModule,
  deactivateScenario,
  listPromptVersions,
  moduleInput,
  personaInput,
  promptInput,
  publishPrompt,
  publishRubric,
  rubricInput,
  scenarioInput,
  updateScenario,
  upsertModule,
} from '../services/admin.service.js';

/**
 * Admin content management (Stage 10). Every route is admin-only: `requireAdmin`
 * is applied at the router level so a new route cannot forget it.
 */
export const adminRouter = Router();

adminRouter.use(requireAdmin);

function parseOrThrow<T>(schema: { safeParse: (v: unknown) => { success: boolean; data?: T; error?: unknown } }, body: unknown): T {
  const r = schema.safeParse(body);
  if (!r.success) {
    throw new HttpError(400, 'Body tidak valid', (r.error as { flatten?: () => unknown })?.flatten?.() ?? r.error);
  }
  return r.data as T;
}

// ── Modules ─────────────────────────────────────────────────────────────────

/**
 * POST /api/trainer/admin/modules
 * Body: moduleInput + optional ?new_version=true
 * Without new_version, re-posting an existing code is rejected — the immutability
 * rule must be an explicit choice, not an accidental overwrite.
 */
adminRouter.post('/modules', async (req, res, next) => {
  try {
    const input = parseOrThrow(moduleInput, req.body);
    const asNewVersion = String(req.query.new_version ?? '') === 'true';
    const result = await upsertModule(input, asNewVersion);
    res.status(201).json({ success: true, ...result });
  } catch (err) {
    next(err);
  }
});

/** DELETE /api/trainer/admin/modules/:id — archive (soft delete, keeps history). */
adminRouter.delete('/modules/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) throw new HttpError(400, 'module id tidak valid.');
    const ok = await deactivateModule(id);
    if (!ok) throw new HttpError(404, 'Modul tidak ditemukan atau sudah tidak aktif.');
    res.json({ success: true, archived: id });
  } catch (err) {
    next(err);
  }
});

// ── Scenarios ───────────────────────────────────────────────────────────────

adminRouter.post('/scenarios', async (req, res, next) => {
  try {
    const input = parseOrThrow(scenarioInput, req.body);
    res.status(201).json({ success: true, ...(await createScenario(input)) });
  } catch (err) {
    next(err);
  }
});

adminRouter.patch('/scenarios/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) throw new HttpError(400, 'scenario id tidak valid.');
    const patch = parseOrThrow(scenarioInput.partial(), req.body);
    const ok = await updateScenario(id, patch);
    if (!ok) throw new HttpError(404, 'Skenario tidak ditemukan atau tidak ada perubahan.');
    res.json({ success: true, updated: id });
  } catch (err) {
    next(err);
  }
});

adminRouter.delete('/scenarios/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) throw new HttpError(400, 'scenario id tidak valid.');
    const ok = await deactivateScenario(id);
    if (!ok) throw new HttpError(404, 'Skenario tidak ditemukan atau sudah tidak aktif.');
    res.json({ success: true, archived: id });
  } catch (err) {
    next(err);
  }
});

// ── Personas ────────────────────────────────────────────────────────────────

adminRouter.post('/personas', async (req, res, next) => {
  try {
    const input = parseOrThrow(personaInput, req.body);
    res.status(201).json({ success: true, ...(await createPersona(input)) });
  } catch (err) {
    next(err);
  }
});

// ── Rubric ──────────────────────────────────────────────────────────────────

/**
 * POST /api/trainer/admin/rubrics
 * Publishes a NEW rubric version. Total weight must be exactly 100.
 */
adminRouter.post('/rubrics', async (req, res, next) => {
  try {
    const input = parseOrThrow(rubricInput, req.body);
    res.status(201).json({ success: true, ...(await publishRubric(input)) });
  } catch (err) {
    next(err);
  }
});

// ── Prompts ─────────────────────────────────────────────────────────────────

/** POST /api/trainer/admin/prompts — publish a new version of a prompt key. */
adminRouter.post('/prompts', async (req, res, next) => {
  try {
    const input = parseOrThrow(promptInput, req.body);
    res.status(201).json({ success: true, ...(await publishPrompt(input)) });
  } catch (err) {
    next(err);
  }
});

/** GET /api/trainer/admin/prompts/:key/versions — audit trail of prompt edits. */
adminRouter.get('/prompts/:key/versions', async (req, res, next) => {
  try {
    const key = String(req.params.key);
    const allowed = ['system', 'persona', 'scenario', 'business', 'rules', 'evaluation'];
    if (!allowed.includes(key)) throw new HttpError(400, `key harus salah satu dari: ${allowed.join(', ')}`);
    res.json({ success: true, key, versions: await listPromptVersions(key) });
  } catch (err) {
    next(err);
  }
});
