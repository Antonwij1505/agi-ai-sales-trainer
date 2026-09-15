import { chat } from './llm.service.js';
import { getActivePromptSet, render, type ResolvedPrompt } from './prompt.service.js';
import {
  appendTurn,
  getTurns,
  loadProductKnowledge,
  type ScenarioContext,
  type TurnRow,
} from './session.service.js';

/**
 * AI Roleplay Engine (Stage 5, PRD §62).
 *
 * Design decision, driven by measurement (see migration 003): the model is asked
 * ONLY to speak as the customer, in plain Indonesian. It is NOT asked to emit a
 * JSON envelope, because the configured providers refused to comply and broke
 * character — one answered with "## Analisis Opening", another offered to draft
 * a sales script. Both destroy the illusion the product depends on.
 *
 * Conversation state (resistance, stage, completion) is therefore owned by the
 * SERVER and computed deterministically:
 *   - auditable and unit-testable without calling an LLM,
 *   - immune to prompt injection from the sales side,
 *   - free (no extra tokens, no extra latency).
 */

export interface RoleplayReply {
  reply: string;
  resistance: number;
  state: string;
  done: boolean;
  model: string;
  provider: string;
  promptVersions: {
    system: number;
    persona: number;
    scenario: number;
    business: number;
    rules: number;
  };
}

/** Keep only the last N turns in the prompt — bounded tokens, enough context. */
const HISTORY_WINDOW = 20;

/**
 * Markers that mean the sales made real progress toward the objective.
 * Indonesian government-telemarketing phrasing; deliberately conservative —
 * a false positive only softens resistance slightly, a false negative only
 * keeps the customer firm.
 */
const PROGRESS_MARKERS = [
  'pengadaan',
  'pic',
  'bapak',
  'ibu',
  'email',
  'kontak',
  'nomor',
  'proposal',
  'surat',
  'kirim',
  'jadwal',
  'follow up',
  'tindak lanjut',
  'terima kasih',
  'silakan',
  'mohon',
];

/** Markers of pressure/aggression, which harden the customer. */
const PRESSURE_MARKERS = [
  'harus',
  'sekarang juga',
  'cepat',
  'pokoknya',
  'sambungkan sekarang',
  'jangan bertele',
  'saya tunggu',
  'kenapa susah',
];

/** Short utterances that end the call from the customer side. */
const CLOSING_MARKERS = ['terima kasih, selamat pagi', 'sudah cukup', 'sampai jumpa'];

/**
 * Deterministic resistance update.
 *
 * Rule: politeness/objective progress softens, pressure hardens, neutral stays.
 * Bounded to 1..5 so the state machine can never leave its range.
 */
export function nextResistance(current: number, salesText: string): number {
  const t = salesText.toLowerCase();
  const hardened = PRESSURE_MARKERS.some((m) => t.includes(m));
  const progressed = PROGRESS_MARKERS.some((m) => t.includes(m));

  let next = current;
  if (hardened) next = current + 1;
  else if (progressed) next = current - 1;

  return Math.max(1, Math.min(5, next));
}

/**
 * Coarse stage label describing the CUSTOMER's stance.
 *
 * Derived from resistance only — the sales' wording must not leak into the
 * customer's state (an earlier version keyed off salesText and reported
 * "escalating" for a customer who had actually softened).
 */
export function deriveState(resistance: number): string {
  if (resistance >= 5) return 'refusing';
  if (resistance === 4) return 'resistant';
  if (resistance === 3) return 'screening';
  if (resistance === 2) return 'softening';
  return 'cooperative';
}

/** The customer hangs up once they have softened fully and a next step exists. */
export function isConversationDone(resistance: number, salesText: string, turnCount: number): boolean {
  const t = salesText.toLowerCase();
  if (CLOSING_MARKERS.some((m) => t.includes(m))) return true;
  // Reached a concrete next step with a softened customer, and enough turns that
  // the evaluation has real material to score.
  return resistance <= 2 && turnCount >= 6;
}

function historyBlock(turns: TurnRow[]): string {
  if (turns.length === 0) return '(belum ada percakapan)';
  return turns
    .slice(-HISTORY_WINDOW)
    .map((t) => `${t.speaker === 'AI' ? 'CS' : 'SALES'}: ${t.text ?? ''}`)
    .join('\n');
}

/**
 * Build the system message from the versioned prompt set. Placeholders are
 * filled from scenario/persona/product rows — never from client-supplied text.
 */
function buildSystemMessage(
  ctx: ScenarioContext,
  prompts: Record<string, ResolvedPrompt>,
  productKnowledge: string,
  resistance: number,
): string {
  const vars = {
    persona_name: ctx.persona_name ?? 'Ibu Sari',
    persona_role: ctx.persona_role ?? 'Staf Front Office',
    persona_attitude: ctx.persona_attitude ?? 'defensive',
    persona_communication_style: ctx.persona_communication_style ?? 'formal_bureaucratic',
    institution_type: ctx.institution_type ?? 'instansi pemerintah',
    scenario_description: ctx.scenario_description ?? '',
    resistance_level: resistance,
    product_category: ctx.product_category ?? 'solusi IT',
    product_knowledge: productKnowledge,
  };

  const resistanceHint =
    resistance >= 4
      ? 'Kamu sedang sangat menolak: jawab pendek, jangan beri informasi, tahan permintaan sales.'
      : resistance === 3
        ? 'Kamu masih ragu: belum mau menyambungkan, tapi mau mendengar sebentar.'
        : 'Kamu mulai terbuka: boleh memberi jalan asal sales sopan dan jelas.';

  return [
    render(prompts.system?.content ?? '', vars),
    render(prompts.persona?.content ?? '', vars),
    render(prompts.scenario?.content ?? '', vars),
    render(prompts.business?.content ?? '', vars),
    render(prompts.rules?.content ?? '', vars),
    resistanceHint,
  ]
    .filter((s) => s.trim().length > 0)
    .join('\n\n');
}

/** Opening line: deterministic, instant, cannot hallucinate. */
export async function openingTurn(
  sessionId: number,
  scenario: ScenarioContext,
  resistance: number,
): Promise<RoleplayReply> {
  const role = scenario.persona_role ?? 'Staf Front Office';
  const institution = scenario.institution_type ?? 'instansi ini';
  const reply = `Selamat pagi, ${role}, ${institution}. Ada yang bisa saya bantu?`;
  await appendTurn(sessionId, 'AI', reply);
  return {
    reply,
    resistance,
    state: 'greeting',
    done: false,
    model: 'deterministic',
    provider: 'template',
    promptVersions: { system: 0, persona: 0, scenario: 0, business: 0, rules: 0 },
  };
}

export interface GenerateReplyInput {
  sessionId: number;
  scenario: ScenarioContext;
  /** Current resistance (1..5), held by the server. */
  resistance: number;
  /** The sales utterance (already transcribed when it came from audio). */
  salesText: string;
  salesAudioRef?: string | null;
}

/** One roleplay turn: persist sales utterance, generate customer reply, update state. */
export async function generateReply(input: GenerateReplyInput): Promise<RoleplayReply> {
  const { sessionId, scenario, salesText } = input;

  await appendTurn(sessionId, 'SALES', salesText, input.salesAudioRef ?? null);

  const [prompts, productKnowledge, turns] = await Promise.all([
    getActivePromptSet(),
    loadProductKnowledge(scenario.product_category),
    getTurns(sessionId),
  ]);

  const resistance = Math.max(1, Math.min(5, input.resistance));

  const messages = [
    {
      role: 'system' as const,
      content: buildSystemMessage(scenario, prompts, productKnowledge, resistance),
    },
    {
      role: 'user' as const,
      content: [
        '=== PERCAKAPAN SEJAUH INI ===',
        historyBlock(turns),
        '',
        'Balas sebagai CS (1-2 kalimat, bahasa Indonesia lisan, tanpa markdown):',
      ].join('\n'),
    },
  ];

  const { content, model, provider } = await chat(messages, {
    temperature: 0.7,
    maxTokens: 400,
    timeoutMs: 45_000,
  });

  const reply = sanitizeCustomerReply(content);
  if (!reply) {
    throw new Error('Model mengembalikan balasan kosong untuk turn roleplay.');
  }

  const newResistance = nextResistance(resistance, salesText);
  const state = deriveState(newResistance);
  const done = isConversationDone(newResistance, salesText, turns.length);

  await appendTurn(sessionId, 'AI', reply);

  return {
    reply,
    resistance: newResistance,
    state,
    done,
    model,
    provider,
    promptVersions: {
      system: prompts.system?.version ?? 0,
      persona: prompts.persona?.version ?? 0,
      scenario: prompts.scenario?.version ?? 0,
      business: prompts.business?.version ?? 0,
      rules: prompts.rules?.version ?? 0,
    },
  };
}

/**
 * Strip artefacts a chat model adds even when told not to: markdown headings,
 * bullet lists, role prefixes, and meta commentary. Returns '' when nothing
 * usable remains, so the caller fails loudly instead of playing garbage audio.
 */
export function sanitizeCustomerReply(raw: string): string {
  let text = raw.trim();

  // Drop a JSON envelope if the model produced one anyway.
  if (text.startsWith('{') && text.includes('"reply"')) {
    try {
      const parsed = JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1)) as {
        reply?: unknown;
      };
      if (typeof parsed.reply === 'string') text = parsed.reply;
    } catch {
      /* fall through to line cleaning */
    }
  }

  const lines = text
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
    // Drop markdown headings, bullets, and horizontal rules.
    .filter((l) => !/^#{1,6}\s/.test(l))
    .filter((l) => !/^[-*+]\s/.test(l))
    .filter((l) => !/^[-*_]{3,}$/.test(l))
    // Drop meta lines the model likes to add.
    .filter((l) => !/^(analisis|analysis|penilaian|catatan|note)\b/i.test(l));

  text = lines.join(' ').trim();

  // Strip a leading role label ("CS:", "Customer:").
  text = text.replace(/^(cs|customer|ibu sari|staf)\s*:\s*/i, '').trim();

  // Remove wrapping quotes.
  if ((text.startsWith('"') && text.endsWith('"')) || (text.startsWith('“') && text.endsWith('”'))) {
    text = text.slice(1, -1).trim();
  }

  // Remove inline markdown emphasis.
  text = text.replace(/\*\*(.+?)\*\*/g, '$1').replace(/\*(.+?)\*/g, '$1');

  return text;
}
