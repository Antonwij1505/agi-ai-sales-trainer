import { Router } from 'express';
import multer from 'multer';
import { z } from 'zod';

import { HttpError } from '../middleware/error.middleware.js';
import { requireAuth } from '../middleware/auth.middleware.js';
import {
  createSession,
  finishSession,
  getSession,
  getTurns,
  loadScenarioContext,
} from '../services/session.service.js';
import { generateReply, openingTurn } from '../services/roleplay.service.js';
import { transcribeAudio } from '../services/stt.service.js';
import { synthesizeSpeech } from '../services/tts.service.js';
import { evaluateSession, loadEvaluation } from '../services/evaluation.service.js';

export const sessionRouter = Router();

// Audio arrives as multipart; keep it in memory (short utterances, capped).
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 }, // 15 MB ≈ well over a 2-minute utterance
});

const startSchema = z.object({
  scenario_id: z.coerce.number().int().positive(),
  assignment_id: z.coerce.number().int().positive().optional(),
  mode: z.enum(['practice', 'exam']).default('practice'),
});

/**
 * POST /api/trainer/sessions
 * Start a roleplay attempt and return the customer's opening line.
 */
sessionRouter.post('/sessions', requireAuth, async (req, res, next) => {
  try {
    const parsed = startSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new HttpError(400, 'Body tidak valid', parsed.error.flatten().fieldErrors);
    }
    const salesId = req.user!.sub;

    const scenario = await loadScenarioContext(parsed.data.scenario_id);
    const session = await createSession({
      salesId,
      scenarioId: parsed.data.scenario_id,
      assignmentId: parsed.data.assignment_id ?? null,
      mode: parsed.data.mode,
    });

    const resistance = scenario.resistance_level ?? scenario.persona_default_resistance ?? 3;
    const opening = await openingTurn(session.id, scenario, resistance);

    res.status(201).json({ success: true, session, opening });
  } catch (err) {
    next(err);
  }
});

/** GET /api/trainer/sessions/:id — session + transcript. */
sessionRouter.get('/sessions/:id', requireAuth, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) throw new HttpError(400, 'session id tidak valid.');

    const session = await getSession(id);
    if (!session) throw new HttpError(404, 'Sesi tidak ditemukan.');
    // A sales may only read their own session; spv/manager/admin may read any.
    if (req.user!.role === 'sales' && session.sales_id !== req.user!.sub) {
      throw new HttpError(403, 'Tidak boleh mengakses sesi sales lain.');
    }

    const [turns, evaluation] = await Promise.all([getTurns(id), loadEvaluation(id)]);
    res.json({ success: true, session, turns, evaluation: evaluation ?? null });
  } catch (err) {
    next(err);
  }
});

const turnSchema = z.object({
  text: z.string().min(1).max(4000),
  resistance: z.coerce.number().int().min(1).max(5).optional(),
});

/**
 * POST /api/trainer/sessions/:id/turn  (text path)
 * Body: { text, resistance? }
 * The sales utterance is already text (e.g. typed or transcribed upstream).
 */
sessionRouter.post('/sessions/:id/turn', requireAuth, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const session = await getSession(id);
    if (!session) throw new HttpError(404, 'Sesi tidak ditemukan.');
    if (session.status !== 'in_progress') throw new HttpError(409, 'Sesi sudah ditutup.');
    if (req.user!.role === 'sales' && session.sales_id !== req.user!.sub) {
      throw new HttpError(403, 'Tidak boleh mengubah sesi sales lain.');
    }

    const parsed = turnSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new HttpError(400, 'Body tidak valid', parsed.error.flatten().fieldErrors);
    }

    const scenario = await loadScenarioContext(session.scenario_id);
    const resistance = parsed.data.resistance ?? scenario.resistance_level ?? 3;

    const reply = await generateReply({
      sessionId: id,
      scenario,
      resistance,
      salesText: parsed.data.text,
    });

    res.json({ success: true, reply });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/trainer/sessions/:id/voice  (voice path — PRD §15)
 * multipart/form-data: audio=<file>, resistance=<1..5>
 *
 * Pipeline: STT → roleplay LLM → TTS, returned together so the client can play
 * the AI reply immediately. Audio is never stored for MVP.
 */
sessionRouter.post(
  '/sessions/:id/voice',
  requireAuth,
  upload.single('audio'),
  async (req, res, next) => {
    try {
      const id = Number(req.params.id);
      const session = await getSession(id);
      if (!session) throw new HttpError(404, 'Sesi tidak ditemukan.');
      if (session.status !== 'in_progress') throw new HttpError(409, 'Sesi sudah ditutup.');
      if (req.user!.role === 'sales' && session.sales_id !== req.user!.sub) {
        throw new HttpError(403, 'Tidak boleh mengubah sesi sales lain.');
      }
      if (!req.file) throw new HttpError(400, "Field 'audio' wajib diisi.");

      const ext = guessExtension(req.file.mimetype, req.file.originalname);
      const stt = await transcribeAudio({
        buffer: req.file.buffer,
        mimeType: req.file.mimetype || 'audio/wav',
        extension: ext,
      });

      const scenario = await loadScenarioContext(session.scenario_id);
      const resistanceRaw = Number((req.body as Record<string, unknown>).resistance);
      const resistance = Number.isFinite(resistanceRaw) ? resistanceRaw : scenario.resistance_level ?? 3;

      const reply = await generateReply({
        sessionId: id,
        scenario,
        resistance,
        salesText: stt.text,
      });

      const tts = await synthesizeSpeech(reply.reply);

      res.json({
        success: true,
        transcript: stt.text,
        stt: { model: stt.model, provider: stt.provider, language: stt.language },
        reply: { ...reply, audio_base64: tts.buffer.toString('base64'), audio_mime: tts.mimeType, voice: tts.voice },
      });
    } catch (err) {
      next(err);
    }
  },
);

/** POST /api/trainer/sessions/:id/finish — close the session. */
sessionRouter.post('/sessions/:id/finish', requireAuth, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const session = await getSession(id);
    if (!session) throw new HttpError(404, 'Sesi tidak ditemukan.');
    if (req.user!.role === 'sales' && session.sales_id !== req.user!.sub) {
      throw new HttpError(403, 'Tidak boleh menutup sesi sales lain.');
    }
    const finished = await finishSession(id);
    res.json({ success: true, session: finished });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/trainer/sessions/:id/evaluate — run the rubric evaluation.
 * Idempotent: calling twice returns the stored evaluation (immutable, §67).
 */
sessionRouter.post('/sessions/:id/evaluate', requireAuth, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const session = await getSession(id);
    if (!session) throw new HttpError(404, 'Sesi tidak ditemukan.');
    if (req.user!.role === 'sales' && session.sales_id !== req.user!.sub) {
      throw new HttpError(403, 'Tidak boleh mengevaluasi sesi sales lain.');
    }

    const evaluation = await evaluateSession(id);
    res.json({ success: true, evaluation });
  } catch (err) {
    next(err);
  }
});

/** GET /api/trainer/sessions/:id/evaluation — read the stored evaluation. */
sessionRouter.get('/sessions/:id/evaluation', requireAuth, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const session = await getSession(id);
    if (!session) throw new HttpError(404, 'Sesi tidak ditemukan.');
    if (req.user!.role === 'sales' && session.sales_id !== req.user!.sub) {
      throw new HttpError(403, 'Tidak boleh mengakses sesi sales lain.');
    }
    const evaluation = await loadEvaluation(id);
    if (!evaluation) throw new HttpError(404, 'Evaluasi belum tersedia untuk sesi ini.');
    res.json({ success: true, evaluation });
  } catch (err) {
    next(err);
  }
});

/** Map a browser/Android mime type to the extension whisper providers expect. */
function guessExtension(mimeType: string, originalName: string): string {
  const fromName = originalName.includes('.') ? originalName.split('.').pop() : undefined;
  if (fromName && fromName.length <= 5) return fromName.toLowerCase();

  const map: Record<string, string> = {
    'audio/wav': 'wav',
    'audio/x-wav': 'wav',
    'audio/wave': 'wav',
    'audio/mpeg': 'mp3',
    'audio/mp4': 'm4a',
    'audio/m4a': 'm4a',
    'audio/x-m4a': 'm4a',
    'audio/aac': 'aac',
    'audio/ogg': 'ogg',
    'audio/opus': 'opus',
    'audio/amr': 'amr',
    'audio/3gpp': '3gp',
    'audio/webm': 'webm',
    'audio/flac': 'flac',
  };
  return map[mimeType.toLowerCase()] ?? 'wav';
}
