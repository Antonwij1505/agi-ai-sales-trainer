import { z } from 'zod';
import { pool } from '../db/pool.js';
import { HttpError } from '../middleware/error.middleware.js';
import { chat, extractJsonObject } from './llm.service.js';

// ── Zod Schemas for Validated AI Output ──────────────────────────────────────

export const competencyScoreItemSchema = z.object({
  competency: z.string(),
  score: z.number().min(0).max(100),
  reason: z.string().min(1, 'Reason/evidence is mandatory for each score'),
  context_classification: z.enum([
    'sales_error',
    'customer_restriction',
    'external_factor',
    'data_uncertainty',
  ]).default('sales_error'),
});

export const callAnalysisResultSchema = z.object({
  competencies: z.array(competencyScoreItemSchema),
  overall_score: z.number().min(0).max(100),
  strengths: z.array(z.string()).default([]),
  weaknesses: z.array(z.string()).default([]),
  behavioral_errors: z.array(z.string()).default([]),
  recommendations: z.array(z.string()).default([]),
  training_needs: z.array(z.string()).default([]),
  confidence_score: z.number().min(0).max(1),
});

export type CallAnalysisResult = z.infer<typeof callAnalysisResultSchema>;

export const whatsappAnalysisResultSchema = z.object({
  opening_score: z.number().min(0).max(100),
  message_quality_score: z.number().min(0).max(100),
  personalization_score: z.number().min(0).max(100),
  response_score: z.number().min(0).max(100),
  follow_up_score: z.number().min(0).max(100),
  cta_score: z.number().min(0).max(100),
  objection_handling_score: z.number().min(0).max(100),
  professionalism_score: z.number().min(0).max(100),
  overall_score: z.number().min(0).max(100),
  reasons: z.record(z.string()),
  strengths: z.array(z.string()).default([]),
  weaknesses: z.array(z.string()).default([]),
  recommendations: z.array(z.string()).default([]),
  confidence_score: z.number().min(0).max(1),
});

export type WhatsAppAnalysisResult = z.infer<typeof whatsappAnalysisResultSchema>;

// ── Service Abstraction Interface ───────────────────────────────────────────

export interface CallAnalysisInput {
  callId: number;
  transcript: string;
  customerContext?: Record<string, unknown>;
}

export interface WhatsAppAnalysisInput {
  conversationId: number;
  messages: Array<{ sender: string; message: string; timestamp?: string }>;
  customerContext?: Record<string, unknown>;
}

export interface AIService {
  analyzeCall(input: CallAnalysisInput): Promise<CallAnalysisResult>;
  analyzeWhatsApp(input: WhatsAppAnalysisInput): Promise<WhatsAppAnalysisResult>;
  analyzeBehavior(input: { history: Array<Record<string, unknown>> }): Promise<{ summary: string }>;
  generateRecommendations(input: { weaknesses: string[]; scores: Record<string, number> }): Promise<string[]>;
}

// ── Mock AI Service (for automated testing without external API) ─────────────

export class MockAIService implements AIService {
  private mockConfidence: number = 0.85;
  private shouldFailTimeout: boolean = false;
  private shouldReturnMalformed: boolean = false;
  private shouldReturnInvalid: boolean = false;

  setConfidence(conf: number) {
    this.mockConfidence = conf;
  }

  setFailTimeout(fail: boolean) {
    this.shouldFailTimeout = fail;
  }

  setReturnMalformed(malformed: boolean) {
    this.shouldReturnMalformed = malformed;
  }

  setReturnInvalid(invalid: boolean) {
    this.shouldReturnInvalid = invalid;
  }

  async analyzeCall(_input: CallAnalysisInput): Promise<CallAnalysisResult> {
    if (this.shouldFailTimeout) {
      throw new Error('AI request timed out after 30000ms');
    }
    if (this.shouldReturnMalformed) {
      throw new Error('Malformed JSON received from AI provider');
    }
    if (this.shouldReturnInvalid) {
      // Missing mandatory fields according to schema
      return {} as unknown as CallAnalysisResult;
    }

    return {
      competencies: [
        {
          competency: 'Opening',
          score: 85,
          reason: 'Sales menyampaikan salam dan identitas institusi dengan jelas.',
          context_classification: 'sales_error',
        },
        {
          competency: 'Communication',
          score: 80,
          reason: 'Artikulasi baik, intonasi sopan dan jelas.',
          context_classification: 'sales_error',
        },
        {
          competency: 'Gatekeeper Handling',
          score: 61,
          reason: 'Sales langsung meminta nomor PIC sebelum menjelaskan konteks paket pengadaan.',
          context_classification: 'sales_error',
        },
        {
          competency: 'Probing',
          score: 75,
          reason: 'Menanyakan jadwal pembahasan RUP dengan tepat.',
          context_classification: 'customer_restriction',
        },
        {
          competency: 'Objection Handling',
          score: 70,
          reason: 'Mampu merespon keberatan jadwal dinas dengan sopan.',
          context_classification: 'external_factor',
        },
        {
          competency: 'Value Proposition',
          score: 80,
          reason: 'Menyebutkan sertifikasi TKDN dan garansi resmi ORIMAX.',
          context_classification: 'sales_error',
        },
        {
          competency: 'Closing / Next Step',
          score: 75,
          reason: 'Berhasil menjadwalkan pengiriman katalog spesifikasi teknis.',
          context_classification: 'sales_error',
        },
        {
          competency: 'Follow-up',
          score: 70,
          reason: 'Menyepakati waktu konfirmasi 2 hari ke depan.',
          context_classification: 'sales_error',
        },
        {
          competency: 'Professionalism / Compliance',
          score: 90,
          reason: 'Mengikuti etika komunikasi instansi pemerintah tanpa menawarkan gratifikasi.',
          context_classification: 'sales_error',
        },
      ],
      overall_score: 76,
      strengths: ['Pembukaan sopan', 'Pemahaman spesifikasi TKDN kuat'],
      weaknesses: ['Teknik handling gatekeeper terburu-buru'],
      behavioral_errors: ['Meminta kontak PIC tanpa membangun urgensi paket RUP'],
      recommendations: ['Latih modul MOD-03 Gatekeeper handling'],
      training_needs: ['Gatekeeper Navigation', 'RUP contextual opening'],
      confidence_score: this.mockConfidence,
    };
  }

  async analyzeWhatsApp(_input: WhatsAppAnalysisInput): Promise<WhatsAppAnalysisResult> {
    return {
      opening_score: 85,
      message_quality_score: 80,
      personalization_score: 75,
      response_score: 85,
      follow_up_score: 70,
      cta_score: 80,
      objection_handling_score: 70,
      professionalism_score: 90,
      overall_score: 79,
      reasons: {
        opening: 'Pesan awal menyertakan nama instansi dan salam formal',
        cta: 'Menyertakan link e-katalog dan permintaan konfirmasi jadwal',
      },
      strengths: ['Format rapi', 'Bahasa sopan'],
      weaknesses: ['Follow up agak lambat'],
      recommendations: ['Balas pesan dalam rentang waktu kerja < 15 menit'],
      confidence_score: this.mockConfidence,
    };
  }

  async analyzeBehavior(_input: { history: Array<Record<string, unknown>> }): Promise<{ summary: string }> {
    return { summary: 'Pola konsisten pada kelemahan penanganan keberatan gatekeeper' };
  }

  async generateRecommendations(_input: { weaknesses: string[]; scores: Record<string, number> }): Promise<string[]> {
    return ['Ambil modul simulasi penolakan gatekeeper di MOD-03'];
  }
}

// ── Live LLM Provider ───────────────────────────────────────────────────────

export class OpenAIAIService implements AIService {
  async analyzeCall(input: CallAnalysisInput): Promise<CallAnalysisResult> {
    const prompt = `Analisis transkrip call telemarketing sales B2G berikut:
Transkrip:
${input.transcript}

Berikan respons HANYA dalam JSON format valid yang memenuhi schema:
{
  "competencies": [
    { "competency": "Opening", "score": 80, "reason": "...", "context_classification": "sales_error" }
  ],
  "overall_score": 80,
  "strengths": ["..."],
  "weaknesses": ["..."],
  "behavioral_errors": ["..."],
  "recommendations": ["..."],
  "training_needs": ["..."],
  "confidence_score": 0.85
}`;

    const res = await chat([
      { role: 'system', content: 'Anda adalah Sales Performance Evaluator B2G berpengalaman.' },
      { role: 'user', content: prompt },
    ]);

    const parsed = extractJsonObject(res.content);
    return callAnalysisResultSchema.parse(parsed);
  }

  async analyzeWhatsApp(input: WhatsAppAnalysisInput): Promise<WhatsAppAnalysisResult> {
    const prompt = `Analisis percakapan WhatsApp sales B2G berikut:
Pesan:
${JSON.stringify(input.messages, null, 2)}

Berikan respons HANYA dalam JSON format valid dengan field opening_score, message_quality_score, personalization_score, response_score, follow_up_score, cta_score, objection_handling_score, professionalism_score, overall_score, reasons, strengths, weaknesses, recommendations, confidence_score.`;

    const res = await chat([
      { role: 'system', content: 'Anda adalah Sales Communication Evaluator B2G.' },
      { role: 'user', content: prompt },
    ]);

    const parsed = extractJsonObject(res.content);
    return whatsappAnalysisResultSchema.parse(parsed);
  }

  async analyzeBehavior(_input: { history: Array<Record<string, unknown>> }): Promise<{ summary: string }> {
    return { summary: 'Evaluasi perilaku umum berdasarkan data historis' };
  }

  async generateRecommendations(input: { weaknesses: string[]; scores: Record<string, number> }): Promise<string[]> {
    return input.weaknesses.map((w) => `Tingkatkan kompetensi terkait: ${w}`);
  }
}

// Default provider instance (swappable)
let currentAIService: AIService = new MockAIService();

export function setAIServiceProvider(provider: AIService) {
  currentAIService = provider;
}

export function getAIServiceProvider(): AIService {
  return currentAIService;
}

// ── Orchestration & Database Integration ────────────────────────────────────

export async function executeCallAnalysis(callId: number) {
  const callRes = await pool.query('SELECT * FROM trainer_calls WHERE id = $1', [callId]);
  if (callRes.rows.length === 0) throw new HttpError(404, 'Call not found');
  const call = callRes.rows[0];

  const provider = getAIServiceProvider();

  let analysisResult: CallAnalysisResult;
  try {
    analysisResult = await provider.analyzeCall({
      callId,
      transcript: call.transcript ?? '',
    });
  } catch (err) {
    // Record failed analysis
    await pool.query(
      `INSERT INTO trainer_ai_analyses (type, reference_id, sales_id, status, confidence_score, analysis_payload)
       VALUES ('call', $1, $2, 'FAILED', 0, $3)`,
      [callId, call.sales_id, JSON.stringify({ error: (err as Error).message })]
    );
    throw new HttpError(500, `AI Analysis failed: ${(err as Error).message}`);
  }

  // Validate output against schema
  const parsed = callAnalysisResultSchema.safeParse(analysisResult);
  if (!parsed.success) {
    await pool.query(
      `INSERT INTO trainer_ai_analyses (type, reference_id, sales_id, status, confidence_score, analysis_payload)
       VALUES ('call', $1, $2, 'FAILED', 0, $3)`,
      [callId, call.sales_id, JSON.stringify({ validation_error: parsed.error.flatten() })]
    );
    throw new HttpError(500, 'AI output validation failed against schema');
  }

  // Check confidence threshold: < 0.70 triggers NEEDS_HUMAN_REVIEW
  const status = parsed.data.confidence_score < 0.7 ? 'NEEDS_HUMAN_REVIEW' : 'COMPLETED';

  const { rows } = await pool.query(
    `INSERT INTO trainer_ai_analyses (type, reference_id, sales_id, overall_score, confidence_score, status, analysis_payload)
     VALUES ('call', $1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [
      callId,
      call.sales_id,
      parsed.data.overall_score,
      parsed.data.confidence_score,
      status,
      JSON.stringify(parsed.data),
    ]
  );

  return rows[0];
}

export async function executeWhatsAppAnalysis(conversationId: number) {
  const waRes = await pool.query('SELECT * FROM trainer_whatsapp_conversations WHERE id = $1', [conversationId]);
  if (waRes.rows.length === 0) throw new HttpError(404, 'WhatsApp conversation not found');
  const wa = waRes.rows[0];

  const provider = getAIServiceProvider();
  const analysisResult = await provider.analyzeWhatsApp({
    conversationId,
    messages: wa.messages,
  });

  const parsed = whatsappAnalysisResultSchema.safeParse(analysisResult);
  if (!parsed.success) {
    throw new HttpError(500, 'WhatsApp AI output validation failed');
  }

  const status = parsed.data.confidence_score < 0.7 ? 'NEEDS_HUMAN_REVIEW' : 'COMPLETED';

  const { rows } = await pool.query(
    `INSERT INTO trainer_ai_analyses (type, reference_id, sales_id, overall_score, confidence_score, status, analysis_payload)
     VALUES ('whatsapp', $1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [
      conversationId,
      wa.sales_id,
      parsed.data.overall_score,
      parsed.data.confidence_score,
      status,
      JSON.stringify(parsed.data),
    ]
  );

  return rows[0];
}

export async function applyHumanReviewOverride(analysisId: number, review: {
  reviewed_by: string;
  override_overall_score?: number;
  manager_notes: string;
}) {
  const existing = await pool.query('SELECT * FROM trainer_ai_analyses WHERE id = $1', [analysisId]);
  if (existing.rows.length === 0) throw new HttpError(404, 'AI Analysis not found');

  const curr = existing.rows[0];
  const newOverall = review.override_overall_score ?? curr.overall_score;

  const reviewPayload = {
    reviewed_by: review.reviewed_by,
    override_overall_score: review.override_overall_score ?? null,
    manager_notes: review.manager_notes,
    reviewed_at: new Date().toISOString(),
  };

  const { rows } = await pool.query(
    `UPDATE trainer_ai_analyses
     SET status = 'OVERRIDDEN',
         overall_score = $1,
         human_review = $2,
         updated_at = now()
     WHERE id = $3
     RETURNING *`,
    [newOverall, JSON.stringify(reviewPayload), analysisId]
  );

  return rows[0];
}

export async function getAnalysisById(id: number) {
  const { rows } = await pool.query('SELECT * FROM trainer_ai_analyses WHERE id = $1', [id]);
  if (rows.length === 0) throw new HttpError(404, 'AI Analysis not found');
  return rows[0];
}

export async function listAnalyses(params: { sales_id?: number; type?: string; status?: string }) {
  let sql = 'SELECT * FROM trainer_ai_analyses WHERE 1=1';
  const values: unknown[] = [];
  let idx = 1;

  if (params.sales_id) {
    sql += ` AND sales_id = $${idx}`;
    values.push(params.sales_id);
    idx++;
  }
  if (params.type) {
    sql += ` AND type = $${idx}`;
    values.push(params.type);
    idx++;
  }
  if (params.status) {
    sql += ` AND status = $${idx}`;
    values.push(params.status);
    idx++;
  }

  sql += ' ORDER BY id DESC LIMIT 50';
  const { rows } = await pool.query(sql, values);
  return rows;
}
