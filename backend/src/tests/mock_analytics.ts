/**
 * Minimal mock of the Sales Analytics result endpoint, for verifying the outbox.
 * Run: npx tsx src/tests/mock_analytics.ts
 *
 * Logs every delivery and returns 200, or 409 when the idempotency key was
 * already seen — which is how the real endpoint behaves and what the trainer's
 * delivery logic must treat as success.
 */
import { createServer } from 'node:http';

const seen = new Set<string>();
const PORT = Number(process.env.MOCK_PORT ?? 4999);

createServer((req, res) => {
  if (req.method !== 'POST') {
    res.writeHead(405).end();
    return;
  }
  let body = '';
  req.on('data', (c) => (body += c));
  req.on('end', () => {
    let parsed: { idempotency_key?: string; session_id?: number; result?: { score?: number } } = {};
    try {
      parsed = JSON.parse(body);
    } catch {
      res.writeHead(400, { 'Content-Type': 'application/json' }).end('{"error":"bad json"}');
      return;
    }

    const key = parsed.idempotency_key ?? '';
    console.log(
      `[mock-analytics] POST session=${parsed.session_id} key=${key} score=${parsed.result?.score}`,
    );

    if (seen.has(key)) {
      // Duplicate delivery: the real service answers 409, and the trainer must
      // treat that as "already recorded" rather than retrying forever.
      res.writeHead(409, { 'Content-Type': 'application/json' }).end('{"status":"duplicate"}');
      return;
    }
    seen.add(key);
    res.writeHead(200, { 'Content-Type': 'application/json' }).end('{"status":"ok"}');
  });
}).listen(PORT, () => {
  console.log(`[mock-analytics] listening on :${PORT}`);
});
