/**
 * live.service.ts — bridge between the Android client and Gemini Live.
 *
 * ARCHITECTURE
 * ------------
 * The Android app never talks to Google directly. It opens a WebSocket to us,
 * we open a second WebSocket to Google, and we relay frames between them.
 *
 * That indirection is not incidental — it is required:
 *   1. PRD §78: zero secrets in the APK. The Google key stays server-side.
 *   2. The key must be rotatable from filter_config without shipping a new APK.
 *   3. We need the transcripts for evaluation, which means seeing the traffic.
 *
 * PROTOCOL (client -> server), JSON per frame:
 *   {"t":"start", "scenario_id": 2}   open the session
 *   {"t":"audio", "pcm":"<base64>"}   PCM16 mono 16 kHz, any chunk size
 *   {"t":"turn_end"}                  the rep finished speaking — answer now
 *   {"t":"stop"}                      close the session
 *
 * SERVER -> CLIENT:
 *   {"t":"ready", "session_id":N}
 *   {"t":"audio", "pcm":"<base64>"}   model speech, streamed as generated
 *   {"t":"transcript", "speaker":"SALES"|"CS", "text":"...", "final":bool}
 *   {"t":"turn_end"}                  model finished this turn
 *   {"t":"error", "message":"..."}
 *
 * WHY EXPLICIT TURN CONTROL
 * -------------------------
 * Measured (backend/scripts/diag_vad.py): Gemini's automatic VAD fires at a
 * natural mid-sentence pause, so a 9.7s utterance was heard as its first ~2s and
 * the model ignored the second request inside it. For a training tool that is a
 * correctness bug. We therefore disable automatic VAD and let the client say when
 * the turn is over.
 */
import WebSocket from 'ws';

import { getLiveConfig } from '../config/credentials.js';
import { env } from '../config/env.js';

const GOOGLE_WS =
  'wss://generativelanguage.googleapis.com/ws/' +
  'google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent';

/** PCM format both sides agree on. */
export const INPUT_RATE = 16_000;
export const OUTPUT_RATE = 24_000;

export interface LiveCallbacks {
  onReady: (model: string, voice: string) => void;
  onAudio: (pcm: Buffer) => void;
  onTranscript: (speaker: 'SALES' | 'CS', text: string) => void;
  onTurnEnd: () => void;
  onError: (message: string) => void;
  onClose: (reason: string) => void;
}

interface ServerMessage {
  setupComplete?: unknown;
  serverContent?: {
    inputTranscription?: { text?: string };
    outputTranscription?: { text?: string };
    modelTurn?: { parts?: Array<{ inlineData?: { data?: string } }> };
    turnComplete?: boolean;
    interrupted?: boolean;
  };
  usageMetadata?: unknown;
  goAway?: { timeLeft?: string };
  error?: { message?: string; status?: string };
}

export class LiveSession {
  private upstream: WebSocket | undefined;
  private closed = false;
  private timer: NodeJS.Timeout | undefined;
  private ready = false;

  constructor(
    private readonly persona: string,
    private readonly cb: LiveCallbacks,
  ) {}

  async open(): Promise<void> {
    const cfg = await getLiveConfig();
    if (!cfg.apiKey) {
      throw new Error(
        'Gemini Live belum dikonfigurasi (trainer_live_api_key / LIVE_API_KEY kosong).',
      );
    }

    const upstream = new WebSocket(`${GOOGLE_WS}?key=${cfg.apiKey}`, {
      maxPayload: 64 * 1024 * 1024,
    });
    this.upstream = upstream;

    // A forgotten socket must not burn quota forever.
    this.timer = setTimeout(() => {
      this.cb.onError('Sesi Live melewati batas waktu maksimum.');
      this.close('timeout');
    }, env.LIVE_MAX_SESSION_MS);
    this.timer.unref?.();

    upstream.on('open', () => {
      const setup: Record<string, unknown> = {
        model: cfg.model,
        generationConfig: {
          responseModalities: ['AUDIO'],
          // Largest single latency lever measured (see docs/GEMINI_LIVE_HASIL.md).
          thinkingConfig: { thinkingBudget: 0 },
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: cfg.voice } },
          },
        },
        systemInstruction: { parts: [{ text: this.persona }] },
        inputAudioTranscription: {},
        outputAudioTranscription: {},
      };
      if (cfg.disableAutoVad) {
        setup.realtimeInputConfig = {
          automaticActivityDetection: { disabled: true },
        };
      }
      upstream.send(JSON.stringify({ setup }));
    });

    upstream.on('message', (raw: WebSocket.RawData) => {
      this.handleUpstream(raw.toString());
    });

    upstream.on('error', (err: Error) => {
      this.cb.onError(`Koneksi ke Gemini gagal: ${err.message}`);
    });

    upstream.on('close', (code: number, reason: Buffer) => {
      if (!this.closed) {
        this.closed = true;
        this.cb.onClose(`upstream ${code}${reason.length ? `: ${reason.toString()}` : ''}`);
      }
      this.clearTimer();
    });
  }

  private handleUpstream(raw: string): void {
    let msg: ServerMessage;
    try {
      msg = JSON.parse(raw) as ServerMessage;
    } catch {
      return;
    }

    if (msg.setupComplete && !this.ready) {
      this.ready = true;
      this.cb.onReady('gemini-live', '');
      return;
    }

    if (msg.error) {
      this.cb.onError(msg.error.message ?? 'Gemini mengembalikan error.');
      return;
    }

    if (msg.goAway) {
      // Google is about to end the session (e.g. context limit).
      this.cb.onError(
        `Sesi akan ditutup oleh Gemini (${msg.goAway.timeLeft ?? 'tanpa info'}).`,
      );
    }

    const sc = msg.serverContent;
    if (!sc) return;

    const inText = sc.inputTranscription?.text;
    if (inText) this.cb.onTranscript('SALES', inText);

    const outText = sc.outputTranscription?.text;
    if (outText) this.cb.onTranscript('CS', outText);

    for (const part of sc.modelTurn?.parts ?? []) {
      const data = part.inlineData?.data;
      if (data) this.cb.onAudio(Buffer.from(data, 'base64'));
    }

    if (sc.interrupted) {
      // The rep talked over the model; the client should stop playback.
      this.cb.onTurnEnd();
    }

    if (sc.turnComplete) this.cb.onTurnEnd();
  }

  /** Forward one PCM chunk from the client to Gemini. */
  sendAudio(pcm: Buffer): void {
    if (!this.ready || this.upstream?.readyState !== WebSocket.OPEN) return;
    this.upstream.send(
      JSON.stringify({
        realtimeInput: {
          mediaChunks: [
            {
              mimeType: `audio/pcm;rate=${INPUT_RATE}`,
              data: pcm.toString('base64'),
            },
          ],
        },
      }),
    );
  }

  /** The rep started speaking (needed when automatic VAD is off). */
  sendActivityStart(): void {
    if (this.upstream?.readyState !== WebSocket.OPEN) return;
    this.upstream.send(JSON.stringify({ realtimeInput: { activityStart: {} } }));
  }

  /** The rep finished speaking — answer now. */
  sendActivityEnd(): void {
    if (this.upstream?.readyState !== WebSocket.OPEN) return;
    this.upstream.send(JSON.stringify({ realtimeInput: { activityEnd: {} } }));
  }

  close(reason = 'client closed'): void {
    this.clearTimer();
    if (this.closed) return;
    this.closed = true;
    try {
      this.upstream?.close(1000, reason);
    } catch {
      /* already gone */
    }
  }

  private clearTimer(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = undefined;
    }
  }
}
