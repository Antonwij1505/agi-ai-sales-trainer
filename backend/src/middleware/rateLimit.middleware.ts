import rateLimit, { ipKeyGenerator, type Options } from 'express-rate-limit';

/**
 * Rate limits (Stage 12).
 *
 * The expensive endpoints are the AI ones: each voice turn costs one STT call,
 * one LLM call and one TTS synthesis, and the evaluation costs a large LLM call.
 * Without a cap, one misbehaving client — or one sales holding the mic button —
 * can burn the provider quota for everyone.
 *
 * Limits are per authenticated user (falling back to IP for unauthenticated
 * routes), because 20 sales behind one office NAT would otherwise share a single
 * IP bucket and starve each other.
 */

/**
 * Key by user when authenticated, by IP otherwise.
 *
 * The IP branch MUST go through `ipKeyGenerator`: a raw `req.ip` string lets an
 * IPv6 client rotate within its /64 and bypass the limit. express-rate-limit
 * raises ERR_ERL_KEY_GEN_IPV6 for a hand-rolled version — and because that error
 * is thrown while the module is being imported, the server still started and
 * listened, so the misconfiguration was silent. Verified by reading the startup
 * log rather than assuming the server was healthy.
 */
function userOrIp(req: { user?: { sub?: number }; ip?: string }): string {
  if (req.user?.sub !== undefined) return `user:${req.user.sub}`;
  return `ip:${ipKeyGenerator(req.ip ?? '0.0.0.0')}`;
}

function build(windowMs: number, max: number, message: string): ReturnType<typeof rateLimit> {
  const options: Partial<Options> = {
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: userOrIp as Options['keyGenerator'],
    message: { error: message },
  };
  return rateLimit(options as Options);
}

/** Voice turns: the priciest path. 30 turns / 5 min is far above real use. */
export const voiceTurnLimiter = build(
  5 * 60_000,
  30,
  'Terlalu banyak percobaan suara. Tunggu sebentar lalu coba lagi.',
);

/** Text turns: cheap-ish, but still an LLM call each. */
export const turnLimiter = build(
  5 * 60_000,
  60,
  'Terlalu banyak percakapan. Tunggu sebentar lalu coba lagi.',
);

/** Evaluations: a large LLM call. Prevents re-evaluating in a loop. */
export const evaluateLimiter = build(
  10 * 60_000,
  15,
  'Terlalu banyak permintaan evaluasi. Tunggu sebentar lalu coba lagi.',
);

/** Session starts and retries: stops a client from creating hundreds of sessions. */
export const sessionLimiter = build(
  10 * 60_000,
  30,
  'Terlalu banyak sesi latihan dibuat. Tunggu sebentar lalu coba lagi.',
);

/** Login: unauthenticated, so keyed by IP. Slows credential stuffing. */
export const loginLimiter = build(
  10 * 60_000,
  20,
  'Terlalu banyak percobaan masuk. Tunggu 10 menit lalu coba lagi.',
);

/** Inbound system API: generous, because analytics may batch. */
export const systemLimiter = build(
  60_000,
  120,
  'Terlalu banyak permintaan dari sistem. Coba lagi sebentar lagi.',
);
