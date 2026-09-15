import { env } from './config/env.js';
import { pool } from './db/pool.js';
import { flushOutbox } from './services/integration.service.js';

/**
 * Outbox worker (Stage 11).
 *
 * Polls `trainer_result_outbox` and delivers evaluated results to Sales
 * Analytics. Delivery is at-least-once; the receiving side dedupes on
 * `session_id` (PRD §82), so a redelivery is harmless.
 *
 * A separate process, not an in-request task: a slow or down analytics service
 * must never block a sales from finishing a practice session.
 */

const POLL_INTERVAL_MS = 15_000;

let running = true;

async function tick(): Promise<void> {
  try {
    // flushOutbox reconciles first, then delivers, so the crash gap is closed on
    // every cycle without a separate step that could be forgotten.
    const { delivered, pending, reconciled } = await flushOutbox(20);
    if (reconciled > 0) console.log(`[outbox] reconciled ${reconciled} result(s) yang belum ter-queue`);
    if (delivered > 0 || pending > 0) {
      console.log(`[outbox] delivered=${delivered} pending=${pending}`);
    }
  } catch (err) {
    console.error('[outbox] error:', (err as Error).message);
  }
}

async function main(): Promise<void> {
  if (!env.ANALYTICS_CALLBACK_URL) {
    console.warn(
      '[outbox] ANALYTICS_CALLBACK_URL kosong — hasil akan tetap tersimpan di outbox ' +
        'dan tidak dikirim sampai URL dikonfigurasi.',
    );
  }
  console.log(`[outbox] worker started (interval ${POLL_INTERVAL_MS} ms)`);

  while (running) {
    await tick();
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }

  await pool.end();
  process.exit(0);
}

const stop = (sig: string): void => {
  console.log(`[outbox] ${sig} — berhenti setelah siklus ini.`);
  running = false;
};

process.on('SIGTERM', () => stop('SIGTERM'));
process.on('SIGINT', () => stop('SIGINT'));

main().catch((err: unknown) => {
  console.error('[outbox] fatal:', err);
  process.exit(1);
});
