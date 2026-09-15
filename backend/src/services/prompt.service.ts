import { query } from '../db/pool.js';

/**
 * Prompt Manager (Stage 4).
 *
 * Prompts are versioned rows in `trainer_prompts`. The manager always resolves
 * the ACTIVE version for a key, but it can also load a specific version so a
 * historical evaluation can be explained with the exact prompt text that
 * produced it (PRD §67).
 */

export type PromptKey =
  | 'system'
  | 'persona'
  | 'scenario'
  | 'business'
  | 'rules'
  | 'evaluation';

export interface ResolvedPrompt {
  id: number;
  key: string;
  version: number;
  content: string;
}

/** Cache the active version per key for a short window (prompts rarely change). */
const CACHE_TTL_MS = 30_000;
const activeCache = new Map<string, { at: number; value: ResolvedPrompt }>();

/** Load the currently active prompt for a key. */
export async function getActivePrompt(key: PromptKey): Promise<ResolvedPrompt> {
  const hit = activeCache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.value;

  const { rows } = await query<ResolvedPrompt>(
    `SELECT id, key, version, content
       FROM trainer_prompts
      WHERE key = $1 AND active
      ORDER BY version DESC
      LIMIT 1`,
    [key],
  );
  const row = rows[0];
  if (!row) {
    throw new Error(`Prompt '${key}' belum dikonfigurasi (tidak ada versi aktif).`);
  }
  activeCache.set(key, { at: Date.now(), value: row });
  return row;
}

/** Load a pinned prompt version — used to replay/explain a past evaluation. */
export async function getPromptById(id: number): Promise<ResolvedPrompt | undefined> {
  const { rows } = await query<ResolvedPrompt>(
    `SELECT id, key, version, content FROM trainer_prompts WHERE id = $1`,
    [id],
  );
  return rows[0];
}

/** Load all active prompts at once (the roleplay turn needs system..rules). */
export async function getActivePromptSet(): Promise<Record<string, ResolvedPrompt>> {
  const keys: PromptKey[] = ['system', 'persona', 'scenario', 'business', 'rules'];
  const entries = await Promise.all(
    keys.map(async (k) => [k, await getActivePrompt(k)] as const),
  );
  return Object.fromEntries(entries);
}

/**
 * Fill `{{placeholder}}` tokens. Unknown tokens are left untouched so a typo is
 * visible in the rendered prompt instead of silently becoming an empty string.
 */
export function render(template: string, vars: Record<string, string | number | undefined>): string {
  return template.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (whole, name: string) => {
    const v = vars[name];
    if (v === undefined || v === null || v === '') return whole;
    return String(v);
  });
}

/** Test/ops helper — drop the cache so a prompt edit takes effect immediately. */
export function clearPromptCache(): void {
  activeCache.clear();
}
