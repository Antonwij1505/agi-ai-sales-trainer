import pg, { type Pool, type PoolClient } from 'pg';

import { env } from '../config/env.js';

/**
 * Postgres `bigint` (int8, OID 20) arrives as a *string* from node-postgres to
 * avoid precision loss. Our bigints are IDs (user ids, FK references), which are
 * far below Number.MAX_SAFE_INTEGER, and leaving them as strings silently breaks
 * numeric comparisons — e.g. `session.sales_id !== req.user.sub` where the JWT
 * carries a number. Parse them to numbers once, here, so the whole service sees
 * a consistent type.
 *
 * Aggregates that could exceed the safe range are cast to text at the query
 * (see `count(*)::text` in session.service.ts).
 */
pg.types.setTypeParser(20, (value: string) => Number(value));

/**
 * Shared connection pool. Bounded because the trainer has ~20 concurrent sales
 * users; a large max would waste Postgres backend memory.
 */
export const pool: Pool = new pg.Pool({
  connectionString: env.DATABASE_URL,
  max: 20,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 30_000,
  keepAlive: true,
  keepAliveInitialDelayMillis: 10_000,
});

// Destroy broken clients immediately so the pool stops handing out dead
// connections after a network blip or a Postgres restart.
pool.on('connect', (client: PoolClient) => {
  client.on('error', (err: Error) => {
    console.error('Destroying dead pg client:', err.message);
    client.release(true);
  });
});

pool.on('error', (err: Error) => {
  console.error('Unexpected error on idle pg client:', err);
});

export function query<T extends pg.QueryResultRow = pg.QueryResultRow>(
  text: string,
  params?: unknown[],
): Promise<pg.QueryResult<T>> {
  return pool.query<T>(text, params);
}

export function connect(): Promise<PoolClient> {
  return pool.connect();
}
