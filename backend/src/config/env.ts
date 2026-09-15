import { z } from 'zod';

/**
 * Validated runtime configuration. Fails fast with a clear message when
 * something required is missing — mirroring the Sales Analytics convention so
 * both services behave identically.
 */
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4100),

  DATABASE_URL: z
    .string()
    .min(1, 'DATABASE_URL is required (e.g. postgresql://user:pass@host:5432/db)'),

  // Comma-separated allowed CORS origins.
  CORS_ORIGIN: z.string().default('http://localhost:3000'),

  // Shared with Sales Analytics so the same JWT is accepted by both services.
  JWT_SECRET: z.string().min(16, 'JWT_SECRET must be at least 16 characters'),

  // System-to-system auth for the inbound/outbound Sales Analytics contract.
  TRAINER_API_KEY: z.string().default(''),

  // Sales Analytics callback target (outbound results). Empty = delivery disabled.
  ANALYTICS_CALLBACK_URL: z.string().default(''),

  // ── AI provider defaults (overridable at runtime from the shared
  //    filter_config credential store — never from the Android client).
  AI_BASE_URL: z.string().default(''),
  AI_API_KEY: z.string().default(''),
  AI_MODEL: z.string().default('cbai/deepseek-v4.1-flash'),
  AI_MODEL_EVAL: z.string().default('cbai/deepseek-v4.1-flash'),

  // STT — OpenAI-compatible transcription endpoint (Groq whisper).
  STT_BASE_URL: z.string().default(''),
  STT_API_KEY: z.string().default(''),
  STT_MODEL: z.string().default('whisper-large-v3'),
  STT_LANGUAGE: z.string().default('id'),

  // TTS — edge-tts voice (free, no key).
  TTS_VOICE: z.string().default('id-ID-GadisNeural'),
  // Slight speed-up: default edge-tts pacing sounds stiff/robotic on the phone.
  TTS_RATE: z.string().default('+8%'),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('❌ Invalid environment configuration:');
  console.error(parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = {
  ...parsed.data,
  corsOrigins: parsed.data.CORS_ORIGIN.split(',')
    .map((o) => o.trim())
    .filter(Boolean),
} as const;

export type Env = typeof env;
