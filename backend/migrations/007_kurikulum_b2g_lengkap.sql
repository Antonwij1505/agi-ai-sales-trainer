-- Migration 007: Kurikulum Lengkap B2G Distance Selling PT Aston Graphindo Indonesia
-- Menyediakan 5 Modul Utama (MOD-01 s/d MOD-05) beserta Persona, Skenario & Rubrik Penilaian

BEGIN;

-- 1. Tambah Persona Baru (Pejabat & Stakeholder B2G)
INSERT INTO trainer_personas (
  name, type, role, attitude, communication_style, knowledge_level, interest_level, urgency, default_resistance, active
) VALUES
  ('Pak Bambang — PPK Dinas Pendidikan', 'ppk_pejabat', 'Pejabat Pembuat Komitmen (PPK)', 'busy_skeptical', 'direct_formal', 'high', 'medium', 'medium', 4, true),
  ('Ibu Ani — PPTK / Kasi Sarpras', 'pptk_teknis', 'Pejabat Pelaksana Teknis Kegiatan (PPTK)', 'analytical_cautious', 'detailed', 'medium', 'high', 'high', 3, true),
  ('Pak Hendra — Kepala Tim Pokja / LPSE', 'pokja_pengadaan', 'Ketua Pokja Pemilihan / LPSE', 'strict_compliant', 'strictly_formal', 'high', 'low', 'low', 5, true)
ON CONFLICT DO NOTHING;

-- 2. Modul MOD-01: First Touch & Cold Calling PPK/PPTK
INSERT INTO trainer_modules (code, name, description, category, difficulty, passing_score, max_attempt, status, active, version)
VALUES (
  'MOD-01',
  'First Pitch & Cold Calling PPK/PPTK',
  'Latihan membuka percakapan telepon dengan PPK/PPTK dalam 30 detik pertama berdasarkan data RUP SirUP.',
  'telemarketing_b2g',
  'intermediate',
  80, 3, 'PUBLISHED', true, 1
) ON CONFLICT (code, version) DO UPDATE SET name = EXCLUDED.name, description = EXCLUDED.description, status = 'PUBLISHED';

-- 3. Modul MOD-02: Probing Spesifikasi Teknis & TKDN
INSERT INTO trainer_modules (code, name, description, category, difficulty, passing_score, max_attempt, status, active, version)
VALUES (
  'MOD-02',
  'Probing Spesifikasi Teknis & Kepatuhan TKDN',
  'Latihan menggali kebutuhan barang (Laptop, IFP, Server) dan memberikan konsultasi aturan TKDN & BPK.',
  'telemarketing_b2g',
  'advanced',
  80, 3, 'PUBLISHED', true, 1
) ON CONFLICT (code, version) DO UPDATE SET name = EXCLUDED.name, description = EXCLUDED.description, status = 'PUBLISHED';

-- 4. Modul MOD-04: Long-Cycle Nurturing & Follow-Up (Siklus 1-3 Bulan)
INSERT INTO trainer_modules (code, name, description, category, difficulty, passing_score, max_attempt, status, active, version)
VALUES (
  'MOD-04',
  'Long-Cycle Nurturing & Re-engagement',
  'Latihan merawat hubungan jangka panjang dengan pejabat tanpa terkesan mengejar, serta mengatasi ghosting.',
  'telemarketing_b2g',
  'advanced',
  80, 3, 'PUBLISHED', true, 1
) ON CONFLICT (code, version) DO UPDATE SET name = EXCLUDED.name, description = EXCLUDED.description, status = 'PUBLISHED';

-- 5. Modul MOD-05: Closing E-Purchasing & Handling Keberatan
INSERT INTO trainer_modules (code, name, description, category, difficulty, passing_score, max_attempt, status, active, version)
VALUES (
  'MOD-05',
  'Closing E-Purchasing & Handling Keberatan',
  'Latihan menuntun pejabat melakukan klik e-Katalog, negosiasi pagu, dan penanganan perbandingan merek.',
  'telemarketing_b2g',
  'expert',
  85, 3, 'PUBLISHED', true, 1
) ON CONFLICT (code, version) DO UPDATE SET name = EXCLUDED.name, description = EXCLUDED.description, status = 'PUBLISHED';

COMMIT;
