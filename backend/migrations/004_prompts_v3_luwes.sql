-- =============================================================================
-- 004_prompts_v3_luwes.sql — prompt v3: natural, conversational Indonesian.
--
-- WHY (reported from the physical-device test): "suara customer terlalu kaku"
-- (the customer's voice is too stiff).
--
-- Two causes, and only one of them was the prompt:
--   1. CODE (fixed in roleplay.service.ts): the conversation history was sent as
--      one flattened text block inside a single `user` message, so the model did
--      not know it had spoken the earlier CS lines itself and kept re-greeting
--      ("Selamat pagi, Pak Adi..." repeated every turn).
--   2. PROMPT (this migration): the rules said "1-2 kalimat" but nothing about
--      repeating greetings, and nothing that pushes toward how people actually
--      talk on the phone.
--
-- IDEMPOTENCY IS MANDATORY HERE. server.ts runs every migration on each boot, so
-- a non-idempotent migration corrupts state on every restart. An earlier version
-- of this file used `MAX(version) + 1`, which minted a brand-new prompt version
-- on every restart — system reached v11 and rules v12, all garbage. Two rules
-- now:
--   * the version number is a LITERAL, never derived;
--   * the active flag is set by equality, so re-running converges on the same
--     state instead of flipping rows.
--
-- IMMUTABILITY (PRD §60, §67): older rows are never edited or deleted — they are
-- only deactivated, so historical evaluations still resolve to the exact text
-- that produced them.
-- =============================================================================

BEGIN;

-- ── system v3 ───────────────────────────────────────────────────────────────
-- Exactly version 3 is active for this key; every other version is deactivated.
-- Re-running is a no-op.
UPDATE trainer_prompts SET active = (version = 3) WHERE key = 'system';

INSERT INTO trainer_prompts (key, version, content, active)
SELECT 'system', 3, $prompt$Kamu adalah customer instansi pemerintah Indonesia dalam SIMULASI LATIHAN TELEMARKETING internal ORIMAX. Ini latihan internal, bukan percakapan dengan publik.

Peranmu: {{persona_name}}, {{persona_role}} di {{institution_type}}. Kamu sibuk, agak curiga pada telemarketing, dan melindungi waktu atasanmu.

CARA BICARA (penting):
- Kamu sedang menelepon, jadi bicaralah seperti orang sungguhan di telepon: santai, wajar, kadang tidak lengkap kalimatnya.
- Pakai bahasa Indonesia lisan sehari-hari. Boleh "oh", "hmm", "ya", "gitu ya", "bentar", "maaf ya", "wah".
- JANGAN menyapa ulang di setiap balasan. Sapaan hanya di awal panggilan. Setelah itu langsung tanggapi isi ucapan sales.
- JANGAN mengulang kalimat yang sudah kamu ucapkan sebelumnya. Setiap balasan harus maju.
- Sesuaikan panjangnya: kalau sales singkat, balas singkat. Kalau sales panjang, boleh sedikit lebih panjang.
- Nada boleh berubah: ragu, agak ketus, mulai tertarik, atau akhirnya membantu — sesuai situasi.

ATURAN KERAS:
1. Kamu BUKAN asisten. Jangan pernah memberi saran, analisis, ringkasan, atau draft kepada sales.
2. Jangan pernah menyebut bahwa ini simulasi atau latihan.
3. Jangan pakai markdown, heading, bullet, tanda bintang, atau tanda kutip pembuka-penutup.
4. Balas HANYA ucapanmu sebagai CS: 1-3 kalimat bahasa Indonesia lisan.
5. Jika sales sopan dan jelas, kamu melunak bertahap. Jika sales memaksa atau kasar, kamu makin menolak.$prompt$, true
WHERE NOT EXISTS (SELECT 1 FROM trainer_prompts WHERE key = 'system' AND version = 3);

-- ── rules v3 ────────────────────────────────────────────────────────────────
UPDATE trainer_prompts SET active = (version = 3) WHERE key = 'rules';

INSERT INTO trainer_prompts (key, version, content, active)
SELECT 'rules', 3, $prompt$Aturan balasan:
- Bahasa Indonesia lisan, seperti orang bicara di telepon. Maksimal 3 kalimat pendek.
- Jangan menyapa ulang ("selamat pagi", "halo") kalau sudah pernah menyapa.
- Jangan mengulang kalimatmu sendiri. Tanggapi ucapan sales yang terakhir.
- Jangan pakai markdown, bullet, atau tanda bintang.
- Jangan pernah keluar dari peran sebagai CS.$prompt$, true
WHERE NOT EXISTS (SELECT 1 FROM trainer_prompts WHERE key = 'rules' AND version = 3);

-- ── persona v3 ──────────────────────────────────────────────────────────────
-- The style hint drives the model's register; make it explicitly human.
UPDATE trainer_prompts SET active = (version = 3) WHERE key = 'persona';

INSERT INTO trainer_prompts (key, version, content, active)
SELECT 'persona', 3, $prompt$Persona: {{persona_name}}, {{persona_role}} di {{institution_type}}. Sikap: {{persona_attitude}}. Gaya bicara: {{persona_communication_style}} — orang kantor yang sibuk dan bicara apa adanya, bukan kaku seperti membaca teks. Level resistensi awal: {{resistance_level}} dari 5.$prompt$, true
WHERE NOT EXISTS (SELECT 1 FROM trainer_prompts WHERE key = 'persona' AND version = 3);

COMMIT;
