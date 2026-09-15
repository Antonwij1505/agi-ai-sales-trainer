import { readFile, readdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { pool } from './pool.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Applies every *.sql file in ../../migrations in filename order.
 *
 * Same convention as Sales Analytics: each migration is written to be safe to
 * re-run (IF NOT EXISTS / DO blocks), so no schema_migrations table is needed.
 * Every trainer migration is additive and touches only `trainer_*` tables.
 */
export async function runMigrations(): Promise<void> {
  const migrationsDir = join(__dirname, '..', '..', 'migrations');
  let files: string[];
  try {
    files = (await readdir(migrationsDir)).filter((f) => f.endsWith('.sql')).sort();
  } catch (err) {
    console.warn('⚠️  No migrations directory found, skipping:', (err as Error).message);
    return;
  }

  for (const file of files) {
    const path = join(migrationsDir, file);
    const sql = await readFile(path, 'utf8');
    console.log(`▶ Applying migration: ${file}`);
    await pool.query(sql);
    console.log(`✓ Applied migration: ${file}`);
  }
}

const isDirectRun = process.argv[1]
  ? /[/\\]migrate\.(ts|js)$/.test(process.argv[1])
  : false;

if (isDirectRun) {
  runMigrations()
    .then(() => pool.end())
    .then(() => {
      console.log('Migrations complete.');
      process.exit(0);
    })
    .catch((err: unknown) => {
      console.error('Migration failed:', err);
      process.exit(1);
    });
}
