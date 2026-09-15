import { getSttConfig } from '../config/credentials.js';

/**
 * Speech-to-Text (Stage 6).
 *
 * Two provider shapes are supported, mirroring the Sales Analytics service so
 * both read the same `filter_config` rows identically:
 *
 *   1. Deepgram native REST (`POST /v1/listen`) — detected from the base URL or
 *      provider name. This is what the shared credential store currently holds,
 *      so it is the live path.
 *   2. Any OpenAI-compatible transcription endpoint
 *      (`POST {baseUrl}/audio/transcriptions`) — Groq whisper, OpenAI, or a
 *      self-hosted whisper server.
 *
 * Credentials come from the shared credential store, never the client.
 */

export interface SttResult {
  text: string;
  language?: string;
  model: string;
  provider: string;
}

export interface AudioInput {
  buffer: Buffer;
  mimeType: string;
  /** File extension the provider should see (e.g. 'wav', 'm4a'). */
  extension: string;
}

/**
 * Deepgram native REST transcription.
 *
 * The shared `stt_model` is `nova-2-phonecall`, which does NOT support Indonesian
 * — Deepgram answers "No such model/language/tier combination found" and points
 * at the Nova-3 general model. Sales Analytics maps it the same way, so a sales
 * session recorded in Indonesian transcribes instead of failing.
 */
async function transcribeDeepgram(
  audio: AudioInput,
  baseUrl: string,
  apiKey: string,
  model: string,
  language: string,
): Promise<SttResult> {
  let useModel = model || 'nova-3';
  if (useModel === 'nova-2-phonecall') useModel = 'nova-3';
  const lang = language || 'id';

  // Build on the configured base so a self-hosted/proxied Deepgram still works,
  // but keep the /v1/listen path and query contract.
  const root = baseUrl.replace(/\/v1\/?$/, '').replace(/\/+$/, '');
  const url = `${root}/v1/listen?model=${encodeURIComponent(useModel)}&language=${encodeURIComponent(lang)}&smart_format=true`;

  const auth = apiKey.startsWith('Token ') || apiKey.startsWith('Bearer ')
    ? apiKey
    : `Token ${apiKey}`;

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: auth,
      'Content-Type': audio.mimeType || 'audio/mpeg',
    },
    body: new Uint8Array(audio.buffer),
    signal: AbortSignal.timeout(120_000),
  });

  if (!res.ok) {
    const raw = await res.text().catch(() => '');
    throw new Error(`Deepgram HTTP ${res.status}: ${raw.slice(0, 300)}`);
  }

  const data = (await res.json()) as {
    results?: { channels?: Array<{ alternatives?: Array<{ transcript?: string }> }> };
    err_msg?: string;
    error?: { message?: string };
  };

  const providerError = data.error?.message ?? data.err_msg;
  if (providerError) throw new Error(`Deepgram error: ${providerError}`);

  const text = (data.results?.channels?.[0]?.alternatives?.[0]?.transcript ?? '').trim();
  if (!text) throw new Error('STT mengembalikan transkrip kosong.');

  return { text, language: lang, model: useModel, provider: 'deepgram' };
}

export async function transcribeAudio(audio: AudioInput): Promise<SttResult> {
  const cfg = await getSttConfig();
  if (!cfg.baseUrl || !cfg.apiKey) {
    throw new Error('STT belum dikonfigurasi (stt_base_url / stt_api_key kosong).');
  }

  const base = cfg.baseUrl.replace(/\/+$/, '');

  // Deepgram speaks its own REST dialect; the OpenAI-compatible path below would
  // 404 against it (that was a real production bug).
  if (base.includes('deepgram.com') || cfg.provider === 'deepgram') {
    return transcribeDeepgram(audio, base, cfg.apiKey, cfg.model, cfg.language);
  }

  const url = `${base}/audio/transcriptions`;

  const form = new FormData();
  form.append(
    'file',
    new Blob([new Uint8Array(audio.buffer)], { type: audio.mimeType }),
    `audio.${audio.extension}`,
  );
  form.append('model', cfg.model);
  if (cfg.language) form.append('language', cfg.language);
  form.append('response_format', 'json');

  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${cfg.apiKey}` },
    body: form,
    signal: AbortSignal.timeout(120_000),
  });

  if (!res.ok) {
    const raw = await res.text().catch(() => '');
    throw new Error(`STT HTTP ${res.status}: ${raw.slice(0, 300)}`);
  }

  const data = (await res.json()) as {
    text?: string;
    language?: string;
    error?: { message?: string };
  };
  if (data.error) {
    throw new Error(`STT provider error: ${data.error.message ?? JSON.stringify(data.error)}`);
  }

  const text = (data.text ?? '').trim();
  if (!text) throw new Error('STT mengembalikan transkrip kosong.');

  return { text, language: data.language, model: cfg.model, provider: cfg.provider };
}
