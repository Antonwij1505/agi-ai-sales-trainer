/**
 * live.routes.ts — WebSocket relay for Gemini Live (speech-to-speech).
 *
 * The Android client connects to /api/trainer/live/:sessionId and speaks PCM. We
 * hold the Google session and relay frames. See live.service.ts for why.
 *
 * AUTH
 * ----
 * Browsers cannot set headers on a WebSocket handshake, so the token may arrive as
 * either `Authorization: Bearer <jwt>` or `?token=<jwt>`. Android (OkHttp) uses the
 * header; the query form exists so the endpoint is testable from a plain client.
 *
 * Tokens in URLs leak into access logs, so when the query form is used we do not
 * log the URL (morgan is configured to skip this path — see app.ts).
 */
import type { IncomingMessage } from 'node:http';
import type { Server } from 'node:http';
import jwt from 'jsonwebtoken';
import { WebSocketServer, type WebSocket } from 'ws';

import { env } from '../config/env.js';
import { getSession, loadScenarioContext, appendTurn } from '../services/session.service.js';
import { buildLiveSystemInstruction } from '../services/roleplay.service.js';
import { LiveSession, type LiveCallbacks } from '../services/live.service.js';
import type { AuthJwtPayload } from '../middleware/auth.middleware.js';

const PATH_PREFIX = '/api/trainer/live/';

interface ClientFrame {
  t?: string;
  pcm?: string;
}

/** Per-connection state. */
interface Conn {
  ws: WebSocket;
  live?: LiveSession;
  sessionId: number;
  salesBuffer: string[];
  csBuffer: string[];
  /** guard so a stray frame after close does not throw */
  closed: boolean;
}

function send(ws: WebSocket, payload: unknown): void {
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(payload));
}

function authenticate(req: IncomingMessage, url: URL): AuthJwtPayload | undefined {
  const header = req.headers.authorization;
  const raw = header?.startsWith('Bearer ') ? header.slice(7) : url.searchParams.get('token');
  if (!raw) return undefined;
  try {
    return jwt.verify(raw, env.JWT_SECRET) as unknown as AuthJwtPayload;
  } catch {
    return undefined;
  }
}

/**
 * Flush buffered transcript fragments as a turn.
 *
 * Gemini streams transcription word by word, so we accumulate and write one row per
 * speaker per turn. Evaluation reads these rows, so they must be complete.
 */
async function flushTurn(conn: Conn, sessionId: number): Promise<void> {
  const sales = conn.salesBuffer.join('').trim();
  const cs = conn.csBuffer.join('').trim();
  conn.salesBuffer = [];
  conn.csBuffer = [];

  try {
    if (sales) await appendTurn(sessionId, 'SALES', sales, null);
    if (cs) await appendTurn(sessionId, 'AI', cs, null);
  } catch (err) {
    // Never kill the live session over a bookkeeping failure.
    console.error('[live] gagal menyimpan transkrip:', (err as Error).message);
  }
}

export function attachLiveRelay(server: Server): WebSocketServer {
  const wss = new WebSocketServer({ noServer: true });

  server.on('upgrade', (req, socket, head) => {
    let url: URL;
    try {
      url = new URL(req.url ?? '', 'http://localhost');
    } catch {
      socket.destroy();
      return;
    }
    if (!url.pathname.startsWith(PATH_PREFIX)) {
      socket.destroy();
      return;
    }

    const sessionId = Number(url.pathname.slice(PATH_PREFIX.length));
    if (!Number.isInteger(sessionId) || sessionId <= 0) {
      socket.write('HTTP/1.1 400 Bad Request\r\n\r\n');
      socket.destroy();
      return;
    }

    const user = authenticate(req, url);
    if (!user) {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      socket.destroy();
      return;
    }

    wss.handleUpgrade(req, socket, head, (ws) => {
      void handleConnection(ws, sessionId, user);
    });
  });

  return wss;
}

async function handleConnection(
  ws: WebSocket,
  sessionId: number,
  user: AuthJwtPayload,
): Promise<void> {
  const conn: Conn = { ws, sessionId, salesBuffer: [], csBuffer: [], closed: false };

  const closeAll = (reason: string): void => {
    if (conn.closed) return;
    conn.closed = true;
    conn.live?.close(reason);
    try {
      ws.close(1000, reason.slice(0, 120));
    } catch {
      /* already gone */
    }
  };

  try {
    const session = await getSession(sessionId);
    if (!session) {
      send(ws, { t: 'error', message: 'Sesi tidak ditemukan.' });
      closeAll('no session');
      return;
    }
    // bigint comes back from pg as a string — compare numerically.
    if (user.role === 'sales' && Number(session.sales_id) !== Number(user.sub)) {
      send(ws, { t: 'error', message: 'Sesi ini bukan milik Anda.' });
      closeAll('forbidden');
      return;
    }

    const scenario = await loadScenarioContext(Number(session.scenario_id));
    // Resistance is a live roleplay dial, not a session column: start each
    // session at the persona's default so the audio model behaves like the text one.
    const instruction = await buildLiveSystemInstruction(
      scenario,
      Number(scenario.persona_default_resistance ?? 3),
    );

    const callbacks: LiveCallbacks = {
      onReady: () => send(ws, { t: 'ready', session_id: sessionId }),
      onAudio: (pcm) => send(ws, { t: 'audio', pcm: pcm.toString('base64') }),
      onTranscript: (speaker, text) => {
        (speaker === 'SALES' ? conn.salesBuffer : conn.csBuffer).push(text);
        send(ws, { t: 'transcript', speaker, text, final: false });
      },
      onTurnEnd: () => {
        void flushTurn(conn, sessionId);
        send(ws, { t: 'turn_end' });
      },
      onError: (message) => send(ws, { t: 'error', message }),
      onClose: (reason) => closeAll(reason),
    };

    const live = new LiveSession(instruction, callbacks);
    conn.live = live;
    await live.open();

    ws.on('message', (raw) => {
      let frame: ClientFrame;
      try {
        frame = JSON.parse(raw.toString()) as ClientFrame;
      } catch {
        return;
      }

      switch (frame.t) {
        case 'audio': {
          if (typeof frame.pcm === 'string' && frame.pcm.length > 0) {
            live.sendAudio(Buffer.from(frame.pcm, 'base64'));
          }
          break;
        }
        case 'turn_start':
          live.sendActivityStart();
          break;
        case 'turn_end':
          live.sendActivityEnd();
          break;
        case 'stop':
          void flushTurn(conn, sessionId).finally(() => closeAll('client stop'));
          break;
        default:
          break;
      }
    });

    ws.on('close', () => {
      if (!conn.closed) {
        conn.closed = true;
        void flushTurn(conn, sessionId);
        conn.live?.close('client disconnected');
      }
    });

    ws.on('error', () => {
      conn.live?.close('client socket error');
    });
  } catch (err) {
    send(ws, { t: 'error', message: (err as Error).message });
    closeAll('setup failed');
  }
}
