-- =============================================================================
-- 003_prompts_v2_plain_speech.sql
--
-- Why this migration exists (evidence, not preference):
--   Prompt v1 required the roleplay model to answer with a JSON envelope
--   ({"reply":..., "resistance":..., "state":..., "done":...}). Measured against
--   the configured providers, models did NOT comply: they answered with either
--   plain prose or with an analysis of the call. Tested 2026-09-15:
--     cbai/deepseek-v4.1-flash  -> plain prose (2.0s)
--     cbai/kimi-k2.6            -> "## Analisis Opening" (16s)
--     cbai/minimax-m3           -> offered to draft a script (17s)
--     bzl/gpt-5.4-mini          -> 402, no credit
--   Forcing JSON made the model break character, which destroys the product.
--
-- Design change: the SERVER owns conversation state, not the model.
--   * the model is asked only for what it is good at: speaking as the customer
--   * resistance / state / done are computed deterministically in code
--     (roleplay.service.ts) — auditable, testable, and impossible to
--     prompt-inject.
--
-- Versioning rule (PRD §67): v1 is NOT edited. v2 is inserted and v1 is
-- deactivated, so any evaluation that pinned v1 can still be explained.
-- =============================================================================

BEGIN;

-- Deactivate the v1 prompts that asked for a JSON envelope.
UPDATE trainer_prompts
   SET active = false
 WHERE version = 1
   AND key IN ('system', 'rules');

-- system v2 — role framing that survives a model that likes to "help".
INSERT INTO trainer_prompts (key, version, content)
SELECT 'system', 2, v.content
FROM (VALUES
    ('Kamu adalah customer instansi pemerintah Indonesia dalam SIMULASI LATIHAN '
     || 'TELEMARKETING internal perusahaan ORIMAX. Ini latihan internal, bukan '
     || 'percakapan dengan publik.' || chr(10) || chr(10)
     || 'Peranmu: petugas front office / CS yang sibuk, sedikit curiga terhadap '
     || 'telemarketing, dan melindungi waktu atasannya.' || chr(10) || chr(10)
     || 'ATURAN KERAS:' || chr(10)
     || '1. Kamu BUKAN asisten. Jangan pernah memberi saran, analisis, ringkasan, '
     || 'atau draft kepada sales.' || chr(10)
     || '2. Jangan pernah menyebut bahwa ini simulasi atau latihan.' || chr(10)
     || '3. Jangan pakai markdown, heading, bullet, atau tanda bintang.' || chr(10)
     || '4. Balas HANYA ucapanmu sebagai CS: 1-2 kalimat bahasa Indonesia lisan.' || chr(10)
     || '5. Jika sales sopan dan jelas, kamu boleh melunak sedikit. Jika sales '
     || 'memaksa atau kasar, kamu makin menolak.')
) AS v(content)
WHERE NOT EXISTS (
    SELECT 1 FROM trainer_prompts WHERE key = 'system' AND version = 2
);

-- rules v2 — plain speech, no JSON. State is owned by the server.
INSERT INTO trainer_prompts (key, version, content)
SELECT 'rules', 2, v.content
FROM (VALUES
    ('Balas sebagai CS saja. Contoh bentuk balasan yang benar:' || chr(10)
     || '  "Ada keperluan apa ya, Pak? Saya sedang banyak kerjaan."' || chr(10)
     || '  "Untuk pengadaan harus lewat bagian pengadaan. Bapak ini dari mana ya?"' || chr(10)
     || '  "Mohon maaf, Bapak saya tidak bisa sambungkan sekarang."' || chr(10) || chr(10)
     || 'Jangan menambahkan penjelasan, penilaian, atau pertanyaan meta di luar '
     || 'peran CS.')
) AS v(content)
WHERE NOT EXISTS (
    SELECT 1 FROM trainer_prompts WHERE key = 'rules' AND version = 2
);

COMMIT;
