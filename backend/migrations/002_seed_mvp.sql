-- =============================================================================
-- 002_seed_mvp.sql
-- MVP curriculum seed (PRD §84, §99-P0):
--   Module 03 — Gatekeeper Handling
--   Persona   — Government CS / gatekeeper instansi pemerintah
--   5 scenarios, weighted rubric (Σ=100), versioned prompts
--
-- Idempotent: guarded by NOT EXISTS on natural keys, so re-running is a no-op
-- and never duplicates content or overwrites an edited version.
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- Persona: the government gatekeeper the sales must get past.
-- ---------------------------------------------------------------------------
INSERT INTO trainer_personas (
    name, type, role, attitude, communication_style,
    knowledge_level, interest_level, urgency, existing_vendor,
    budget_condition, default_resistance
)
SELECT
    'Pak Garuda — CS Dinas',
    'government_cs',
    'Staf Front Office / CS',
    'sibuk_ramah',
    'santai_profesional',
    'low',
    'low',
    'low',
    NULL,
    'unknown',
    4
WHERE NOT EXISTS (
    -- Guard on the stable business key (type), NOT on the display name.
    --
    -- Why: this migration runs on every server start. The display name is changed
    -- by a later migration (006), so a name-based guard would stop matching after
    -- that rename and insert a duplicate persona on every single restart. The
    -- persona type is the stable identity, so it is the correct key here.
    SELECT 1 FROM trainer_personas WHERE type = 'government_cs'
);

-- ---------------------------------------------------------------------------
-- Module 03 — Gatekeeper Handling.
-- ---------------------------------------------------------------------------
INSERT INTO trainer_modules (
    code, name, description, category, difficulty, passing_score, max_attempt, status
)
SELECT
    'MOD-03',
    'Gatekeeper Handling',
    'Kemampuan menembus CS/gatekeeper instansi pemerintah untuk mendapatkan '
    || 'nama dan kontak PIC pengadaan, tanpa membuat gatekeeper merasa '
    || 'dilewati atau terancam.',
    'prospecting',
    'basic',
    80,
    3,
    'ACTIVE'
WHERE NOT EXISTS (
    SELECT 1 FROM trainer_modules WHERE code = 'MOD-03' AND version = 1
);

-- ---------------------------------------------------------------------------
-- 5 MVP scenarios.
-- ---------------------------------------------------------------------------
INSERT INTO trainer_scenarios (
    module_id, name, description, persona_id, difficulty, resistance_level,
    product_category, institution_type, objective, success_criteria,
    failure_criteria, rup_context_required, status
)
SELECT
    m.id, s.name, s.description, p.id, s.difficulty, s.resistance_level,
    s.product_category, s.institution_type, s.objective, s.success_criteria,
    s.failure_criteria, s.rup_required, 'ACTIVE'
FROM trainer_modules m
CROSS JOIN trainer_personas p
CROSS JOIN (VALUES
    (
        'Tembus CS Dinas — Minta Nama PIC',
        'CS dinas mengangkat telepon. Sales harus memperkenalkan diri dan '
        || 'mendapatkan nama serta kontak PIC pengadaan.',
        'basic', 3, 'Laptop Detachable', 'Dinas Pendidikan Provinsi',
        'Mendapatkan nama lengkap, jabatan, dan nomor kontak PIC pengadaan.',
        'Sales menyebut nama & institusi dengan jelas, menjelaskan tujuan singkat, '
        || 'dan menutup dengan permintaan nama PIC secara spesifik.',
        'Sales langsung memaksa bicara ke pengadaan di 10 detik pertama, atau '
        || 'menutup telepon tanpa mendapatkan nama PIC.',
        false
    ),
    (
        'CS Menolak Sambungkan — Soft Resistance',
        'CS menolak menyambungkan dengan alasan "bapak sedang rapat". Sales '
        || 'harus mencari jalan tanpa memaksa.',
        'basic', 4, 'Printer Multifungsi', 'Dinas Kesehatan Kabupaten',
        'Mendapatkan komitmen waktu follow-up atau nomor kontak PIC.',
        'Sales mengakui keberatan CS, menawarkan alternatif (kirim proposal/WA), '
        || 'dan mendapat jadwal atau kontak.',
        'Sales memaksa disambungkan sekarang, berdebat dengan CS, atau menutup '
        || 'tanpa mendapatkan apa pun.',
        false
    ),
    (
        'CS Minta Proposal Dikirim Dulu',
        'CS meminta proposal resmi dikirim sebelum mau menyambungkan. Sales '
        || 'harus menggunakan momen ini untuk mendapat kontak PIC.',
        'basic', 3, 'Proyektor Interaktif', 'Dinas Pekerjaan Umum',
        'Mendapatkan alamat email/nomor PIC agar proposal terkirim ke orang benar.',
        'Sales setuju mengirim proposal, lalu meminta nama penerima & email '
        || 'langsung PIC pengadaan.',
        'Sales setuju mengirim proposal ke email umum dinas tanpa menanyakan PIC, '
        || 'sehingga proposal tidak sampai ke pengambil keputusan.',
        false
    ),
    (
        'CS Bertanya "Ini Perusahaan Apa?"',
        'CS mencurigai telemarketing dan mempertanyakan kredibilitas perusahaan. '
        || 'Sales harus membangun kepercayaan singkat.',
        'intermediate', 4, 'Server & Storage', 'Sekretariat Daerah',
        'Meyakinkan CS dengan kredibilitas singkat dan mendapatkan akses ke PIC.',
        'Sales menyebut pengalaman/klien pemerintah dan referensi relevan secara '
        || 'ringkas, lalu meminta sambungan ke pengadaan.',
        'Sales menyebut klaim berlebihan yang tidak terverifikasi, atau gagal '
        || 'memberikan alasan mengapa layak disambungkan.',
        false
    ),
    (
        'Gatekeeper dengan Konteks RUP',
        'CS sudah tahu paket instansinya ada di RUP. Sales memanfaatkan konteks '
        || 'RUP untuk membuka percakapan ke PIC pengadaan.',
        'intermediate', 5, 'Laptop Detachable', 'Dinas Pendidikan Provinsi',
        'Mendapatkan nama PIC pengadaan dengan menyebut paket RUP yang relevan.',
        'Sales menyebut paket RUP secara akurat (nama paket & pagu), lalu meminta '
        || 'kontak PIC yang menangani paket tersebut.',
        'Sales menyebut data RUP yang salah/tidak ada, atau membocorkan bahwa '
        || 'mereka menebak sehingga kredibilitas jatuh.',
        true
    )
) AS s(name, description, difficulty, resistance_level, product_category,
       institution_type, objective, success_criteria, failure_criteria, rup_required)
WHERE m.code = 'MOD-03' AND m.version = 1
  AND NOT EXISTS (
      SELECT 1 FROM trainer_scenarios x WHERE x.name = s.name AND x.module_id = m.id
  );

-- ---------------------------------------------------------------------------
-- Weighted rubric for MOD-03 (Σ weight = 100).
-- ---------------------------------------------------------------------------
INSERT INTO trainer_rubrics (module_id, name, competency, weight, criteria, scoring_instruction)
SELECT m.id, r.name, r.competency, r.weight, r.criteria, r.scoring_instruction
FROM trainer_modules m
CROSS JOIN (VALUES
    ('Pembukaan & Kredibilitas', 'opening_credibility', 15,
     'Menyebut nama, perusahaan, dan tujuan secara jelas dalam 15 detik pertama.',
     'Skor penuh jika ketiga elemen ada dan ringkas. Kurangi bila bertele-tele atau tidak menyebut perusahaan.'),
    ('Menembus Gatekeeper', 'gatekeeper_handling', 30,
     'Menghadapi CS tanpa memaksa, mencari jalur alternatif, dan mendapatkan nama PIC.',
     'Skor penuh jika sales mendapat nama/jabatan PIC atau komitmen waktu konkret. '
     || 'Nol jika memaksa, berdebat, atau menutup tanpa hasil.'),
    ('Discovery & Probing', 'discovery_probing', 20,
     'Mengajukan pertanyaan terbuka untuk memahami kebutuhan dan konteks instansi.',
     'Skor penuh jika minimal 2 pertanyaan terbuka relevan dan sales mendengar jawabannya.'),
    ('Menangani Objection', 'objection_handling', 20,
     'Merespons keberatan CS dengan empati dan solusi, bukan bantahan.',
     'Skor penuh jika sales mengakui keberatan lalu menawarkan alternatif. Kurangi bila berdebat.'),
    ('Closing & Next Step', 'closing_next_step', 15,
     'Menutup percakapan dengan langkah lanjut yang spesifik dan terverifikasi.',
     'Skor penuh jika ada next step dengan waktu/pemilik jelas. Nol jika menggantung tanpa komitmen.')
) AS r(name, competency, weight, criteria, scoring_instruction)
WHERE m.code = 'MOD-03' AND m.version = 1
  AND NOT EXISTS (
      SELECT 1 FROM trainer_rubrics x WHERE x.module_id = m.id AND x.competency = r.competency
  );

-- ---------------------------------------------------------------------------
-- Versioned prompts (v1). Editing a prompt must INSERT version 2 and flip
-- version 1 to inactive — never UPDATE content in place (PRD §67).
-- ---------------------------------------------------------------------------
INSERT INTO trainer_prompts (key, version, content)
SELECT p.key, 1, p.content
FROM (VALUES
    ('system',
     'Kamu adalah customer instansi pemerintah Indonesia dalam simulasi '
     || 'telemarketing B2B. Kamu BUKAN asisten. Jangan pernah keluar dari peran, '
     || 'jangan memberi saran ke sales, jangan mengevaluasi. Balas hanya sebagai '
     || 'customer dengan bahasa Indonesia lisan yang wajar dan singkat (1-3 kalimat).'),
    ('persona',
     'Persona: {{persona_name}}, {{persona_role}} di {{institution_type}}. '
     || 'Sikap: {{persona_attitude}}. Gaya komunikasi: {{persona_communication_style}}. '
     || 'Level resistensi awal: {{resistance_level}} dari 5. '
     || 'Kamu sibuk, sedikit curiga terhadap telemarketing, dan melindungi waktu atasanmu.'),
    ('scenario',
     'Situasi: {{scenario_description}} Tujuanmu sebagai customer: tetap menjaga '
     || 'protokol instansi. Kamu boleh melunak HANYA jika sales sopan, jelas, dan '
     || 'memberi alasan yang masuk akal untuk disambungkan.'),
    ('business',
     'Konteks bisnis: ORIMAX adalah supplier solusi IT untuk instansi pemerintah '
     || 'Indonesia. Produk yang relevan: {{product_category}}. '
     || 'FAKTA PRODUK: {{product_knowledge}} — gunakan HANYA fakta ini. '
     || 'Jika informasi tidak ada di daftar, katakan kamu tidak tahu detailnya; '
     || 'JANGAN mengarang spesifikasi, harga, atau sertifikasi.'),
    ('rules',
     'Aturan: 1) Selalu tetap dalam peran customer. 2) Jangan pernah menyebut '
     || 'bahwa ini simulasi. 3) Jangan membantu sales. 4) Jika sales memaksa atau '
     || 'kasar, naikkan resistensi. 5) Jika sales sopan dan tepat, turunkan '
     || 'resistensi secara bertahap. 6) Balas JSON: '
     || '{"reply": string, "resistance": 1-5, "state": string, "done": boolean}.'),
    ('evaluation',
     'Kamu adalah evaluator pelatihan sales. Nilai transkrip berdasarkan rubric '
     || 'berbobot yang diberikan. Untuk SETIAP kompetensi, kutip bukti langsung '
     || 'dari transkrip — skor tanpa bukti tidak sah. Jika bukti tidak ada, beri '
     || 'skor rendah dan tulis bukti "tidak ditemukan". Perhatikan: penolakan '
     || 'customer BUKAN otomatis kesalahan sales; nilai caranya, bukan hasilnya. '
     || 'Jangan menilai dari kata kunci saja. Balas HANYA JSON sesuai skema.')
) AS p(key, content)
WHERE NOT EXISTS (
    SELECT 1 FROM trainer_prompts x WHERE x.key = p.key AND x.version = 1
);

-- ---------------------------------------------------------------------------
-- Product knowledge — the ONLY sanctioned source of product facts (risk R4).
-- ---------------------------------------------------------------------------
INSERT INTO trainer_product_knowledge (category, name, payload, status, active)
SELECT k.category, k.name, k.payload::jsonb, 'ACTIVE', true
FROM (VALUES
    ('Laptop Detachable', 'ORIMAX Detachable 2-in-1',
     '{"form_factor":"detachable 2-in-1","use_case":"mobilitas tinggi untuk dinas lapangan","notes":"spesifikasi detail menyusul dari tim produk"}'),
    ('Printer Multifungsi', 'ORIMAX MFP Series',
     '{"functions":["print","scan","copy","fax"],"use_case":"kebutuhan dokumen kantor dinas","notes":"spesifikasi detail menyusul dari tim produk"}'),
    ('Proyektor Interaktif', 'ORIMAX Interactive Projector',
     '{"features":["interactive pen","short throw"],"use_case":"ruang rapat dan kelas","notes":"spesifikasi detail menyusul dari tim produk"}'),
    ('Server & Storage', 'ORIMAX Server Solution',
     '{"use_case":"infrastruktur data center instansi","notes":"spesifikasi detail menyusul dari tim produk"}')
) AS k(category, name, payload)
WHERE NOT EXISTS (
    SELECT 1 FROM trainer_product_knowledge x WHERE x.name = k.name
);

COMMIT;
