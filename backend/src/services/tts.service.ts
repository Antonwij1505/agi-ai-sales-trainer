import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { env } from '../config/env.js';

/**
 * Text-to-Speech (Stage 6).
 *
 * Uses edge-tts — free, no API key, and it has proper Indonesian neural voices
 * (`id-ID-ArdiNeural` male, `id-ID-GadisNeural` female). That matters because
 * neither 9router nor Groq expose a TTS model, so without this the AI could not
 * speak at all (PRD §15.9).
 *
 * Wrapped behind a provider boundary so a commercial TTS can be swapped in
 * without touching callers.
 */

export interface TtsResult {
  buffer: Buffer;
  mimeType: string;
  extension: string;
  voice: string;
  provider: string;
}

export interface TtsOptions {
  voice?: string;
  /** Speech rate, e.g. '+10%' or '-5%'. */
  rate?: string;
  timeoutMs?: number;
}

const DEFAULT_VOICE = env.TTS_VOICE;
const DEFAULT_RATE = env.TTS_RATE;
const DEFAULT_TIMEOUT_MS = 60_000;

/**
 * Synthesise speech to MP3.
 *
 * Runs the edge-tts CLI in a scratch directory so concurrent requests cannot
 * collide on the same output file, and so a crash cannot leave partial audio in
 * the storage tree.
 */
export async function synthesizeSpeech(
  text: string,
  options: TtsOptions = {},
): Promise<TtsResult> {
  const trimmed = text.trim();
  if (!trimmed) throw new Error('TTS: teks kosong.');

  const voice = options.voice ?? DEFAULT_VOICE;
  const dir = await mkdtemp(join(tmpdir(), 'agi-tts-'));
  const outPath = join(dir, 'out.mp3');

  try {
    await runEdgeTts(
      trimmed,
      voice,
      outPath,
      options.rate ?? DEFAULT_RATE,
      options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    );
    const buffer = await readFile(outPath);
    if (buffer.length === 0) throw new Error('TTS menghasilkan file kosong.');
    return {
      buffer,
      mimeType: 'audio/mpeg',
      extension: 'mp3',
      voice,
      provider: 'edge-tts',
    };
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

function runEdgeTts(
  text: string,
  voice: string,
  outPath: string,
  rate: string | undefined,
  timeoutMs: number,
): Promise<void> {
  return new Promise((resolve, reject) => {
    // edge-tts is not installed as a Python module in this Node service; we shell
    // out to the CLI so no Python dependency leaks into the Node build.
    const args = ['--voice', voice, '--text', text, '--write-media', outPath];
    if (rate) args.push('--rate', rate);

    const child = spawn('edge-tts', args, { stdio: ['ignore', 'pipe', 'pipe'] });

    let stderr = '';
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error(`TTS timeout setelah ${timeoutMs} ms`));
    }, timeoutMs);

    child.on('error', (err) => {
      clearTimeout(timer);
      reject(
        new Error(
          `Gagal menjalankan edge-tts (${err.message}). Pastikan CLI 'edge-tts' terpasang dan ada di PATH.`,
        ),
      );
    });

    child.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0) resolve();
      else reject(new Error(`edge-tts keluar dengan kode ${code}: ${stderr.slice(0, 300)}`));
    });
  });
}

/** Indonesian voices exposed by edge-tts (used by the admin UI later). */
export const INDONESIAN_VOICES = {
  male: 'id-ID-ArdiNeural',
  female: 'id-ID-GadisNeural',
} as const;

/** Write a helper so callers can hand a stable file to storage. */
export async function writeTtsToFile(text: string, absPath: string): Promise<TtsResult> {
  const result = await synthesizeSpeech(text);
  await writeFile(absPath, result.buffer);
  return result;
}
