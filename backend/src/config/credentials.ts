import { env } from './env.js';
import { query } from '../db/pool.js';

/**
 * Runtime credential resolution.
 *
 * Reuses the Sales Analytics pattern: admin-editable rows in the shared
 * `filter_config` table, with environment variables as fallback, cached briefly.
 * Provider keys therefore never reach the Android client (PRD §8, §78) and can
 * be rotated from the admin UI without a redeploy.
 */

const CACHE_TTL_MS = 30_000;

interface Cached<T> {
  at: number;
  value: T;
}

let aiCache: Cached<AiConfig> | undefined;
let sttCache: Cached<SttConfig> | undefined;
let liveCache: Cached<LiveConfig> | undefined;

export interface AiConfig {
  provider: string;
  baseUrl: string;
  apiKey: string;
  model: string;
  modelEval: string;
}

export interface SttConfig {
  provider: string;
  baseUrl: string;
  apiKey: string;
  model: string;
  language: string;
}

/**
 * Gemini Live (speech-to-speech) config.
 *
 * The Android client never sees `apiKey`: it speaks to our WebSocket relay, which
 * opens the upstream Live session (PRD §78 — zero secrets in the APK).
 */
export interface LiveConfig {
  apiKey: string;
  model: string;
  voice: string;
  /** Explicit turn control is required: automatic VAD cuts turns mid-sentence. */
  disableAutoVad: boolean;
}

async function readConfigMap(keys: string[]): Promise<Record<string, string>> {
  try {
    const { rows } = await query<{ key: string; value: string }>(
      `SELECT key, value FROM filter_config WHERE key = ANY($1::text[])`,
      [keys],
    );
    return Object.fromEntries(rows.map((r) => [r.key, r.value]));
  } catch {
    // filter_config may not exist in a fresh environment — fall back to env.
    return {};
  }
}

/**
 * AI (LLM) provider config.
 *
 * Precedence: trainer-specific override → shared analytics value → env.
 *
 * Why the override exists: the shared `ai_model` (orimax_fast) is tuned for the
 * analytics batch pipeline, where a 30-60s answer is acceptable. The trainer
 * needs 1-3s conversational latency (PRD §77). Rather than change a key the
 * analytics service also reads, the trainer declares its own keys and falls back
 * to the shared ones when they are absent.
 */
export async function getAiConfig(): Promise<AiConfig> {
  if (aiCache && Date.now() - aiCache.at < CACHE_TTL_MS) return aiCache.value;

  const db = await readConfigMap([
    'trainer_ai_provider',
    'trainer_ai_base_url',
    'trainer_ai_api_key',
    'trainer_ai_model',
    'trainer_ai_model_eval',
    'ai_provider',
    'ai_base_url',
    'ai_api_key',
    'ai_model',
  ]);

  const value: AiConfig = {
    provider: db.trainer_ai_provider || db.ai_provider || 'custom',
    baseUrl: db.trainer_ai_base_url || db.ai_base_url || env.AI_BASE_URL,
    apiKey: db.trainer_ai_api_key || db.ai_api_key || env.AI_API_KEY,
    model: db.trainer_ai_model || env.AI_MODEL,
    modelEval: db.trainer_ai_model_eval || env.AI_MODEL_EVAL,
  };

  aiCache = { at: Date.now(), value };
  return value;
}

/** STT provider config (OpenAI-compatible transcription endpoint). */
export async function getSttConfig(): Promise<SttConfig> {
  if (sttCache && Date.now() - sttCache.at < CACHE_TTL_MS) return sttCache.value;

  const db = await readConfigMap([
    'stt_provider',
    'stt_base_url',
    'stt_api_key',
    'stt_model',
    'stt_language',
  ]);

  const value: SttConfig = {
    provider: db.stt_provider || 'custom',
    baseUrl: db.stt_base_url || env.STT_BASE_URL,
    apiKey: db.stt_api_key || env.STT_API_KEY,
    model: db.stt_model || env.STT_MODEL,
    language: db.stt_language || env.STT_LANGUAGE,
  };

  sttCache = { at: Date.now(), value };
  return value;
}

/**
 * Gemini Live config.
 *
 * Precedence: trainer-specific keys → env. Deliberately does NOT fall back to the
 * shared `ai_api_key`: that key belongs to the 9router gateway, which cannot proxy
 * the Live API (it only advertises `generateContent`). Using it here would fail at
 * connect time with a confusing error.
 */
export async function getLiveConfig(): Promise<LiveConfig> {
  if (liveCache && Date.now() - liveCache.at < CACHE_TTL_MS) return liveCache.value;

  const db = await readConfigMap([
    'trainer_live_api_key',
    'trainer_live_model',
    'trainer_live_voice',
    'trainer_live_disable_auto_vad',
  ]);

  const value: LiveConfig = {
    apiKey: db.trainer_live_api_key || env.LIVE_API_KEY,
    model: db.trainer_live_model || env.LIVE_MODEL,
    voice: db.trainer_live_voice || env.LIVE_VOICE,
    // Default true: measured that automatic VAD truncates turns mid-sentence.
    disableAutoVad: (db.trainer_live_disable_auto_vad ?? String(env.LIVE_DISABLE_AUTO_VAD)) !== 'false',
  };

  liveCache = { at: Date.now(), value };
  return value;
}

/** Test/ops helper — force the next read to hit the database. */
export function clearCredentialCache(): void {
  aiCache = undefined;
  sttCache = undefined;
  liveCache = undefined;
}
