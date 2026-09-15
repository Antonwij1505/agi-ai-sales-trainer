import { createApp } from './app.js';
import { env } from './config/env.js';
import { runMigrations } from './db/migrate.js';
import { pool } from './db/pool.js';

async function main(): Promise<void> {
  // Apply migrations before serving traffic (idempotent).
  await runMigrations();

  const app = createApp();
  const server = app.listen(env.PORT, () => {
    console.log(`AGI Trainer backend listening on :${env.PORT} (${env.NODE_ENV})`);
  });

  const shutdown = (signal: string): void => {
    console.log(`${signal} received — shutting down.`);
    server.close(() => {
      pool.end().finally(() => process.exit(0));
    });
    // Force-exit if graceful close stalls.
    setTimeout(() => process.exit(1), 10_000).unref();
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch((err: unknown) => {
  console.error('Fatal startup error:', err);
  process.exit(1);
});
