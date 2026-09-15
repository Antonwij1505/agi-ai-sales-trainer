import { getSttConfig } from '../config/credentials.js';

/**
 * Speech-to-Text (Stage 6).
 *
 * Talks to any OpenAI-compatible transcription endpoint
 * (`POST {baseUrl}/audio/transcriptions`), so the concrete provider
 * (Groq whisper, OpenAI, or a self-hosted whisper server) stays a configuration
 * choice. Credentials come from the shared credential store, never the client.
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

export async function transcribeAudio(audio: AudioInput): Promise<SttResult> {
  const cfg = await getSttConfig();
  if (!cfg.baseUrl || !cfg.apiKey) {
    throw new Error('STT belum dikonfigurasi (stt_base_url / stt_api_key kosong).');
  }

  const base = cfg.baseUrl.replace(/\/+$/, '');
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
