-- =============================================================================
-- Migration 015: Orimax Real-World Curriculum Expansion
-- Ekspansi materi kurikulum sales AGI AI Sales Trainer:
-- 1. Product Knowledge resmi Orimax (Toner Compatible TKDN, IFP, MPS Rental)
-- 2. Personas instansi riil (RSUD, Diskominfo, Setda, B2B Pabrik, Gatekeeper PUPR)
-- 3. 15 Skenario Latihan Riil B2G & B2B (Total 24 Skenario di 5 Modul)
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 0. BERSIHKAN DUPLIKASI PERSONAS & REFERENSI
-- -----------------------------------------------------------------------------
DELETE FROM trainer_personas a USING trainer_personas b
WHERE a.id > b.id AND a.type = b.type;

-- -----------------------------------------------------------------------------
-- 1. ENRICH PRODUCT KNOWLEDGE: Produk Resmi & Keunggulan Orimax
-- -----------------------------------------------------------------------------

-- Non-aktifkan placeholder lama jika ada
UPDATE trainer_product_knowledge 
SET active = false 
WHERE name IN ('ORIMAX Server Solution', 'ORIMAX MFP Series', 'ORIMAX Detachable 2-in-1', 'ORIMAX Interactive Projector');

-- Insert Produk Flagship Orimax
INSERT INTO trainer_product_knowledge (category, name, payload, version, status, active)
SELECT
  'Toner Cartridge & Consumables',
  'Toner Cartridge Compatible Orimax (Seri HP MX-85A, MX-83A, MX-26A, MX-05A)',
  '{
    "brand": "ORIMAX",
    "manufacturer": "PT Aston Graphindo Indonesia",
    "tkdn_percentage": 43.82,
    "tkdn_certificate": "Kemenperin RI No. 1284/SJ-IND.8/TKDN/2023",
    "certifications": ["ISO 9001:2015 (Kualitas)", "ISO 14001:2015 (Lingkungan)", "RoHS Compliance"],
    "fast_moving_models": [
      {"code": "MX-85A (CE285A)", "page_yield": 1600, "printers": "HP LaserJet P1102, M1132, M1212nf"},
      {"code": "MX-83A (CF283A)", "page_yield": 1500, "printers": "HP LaserJet M125, M127, M201, M225"},
      {"code": "MX-26A (CF226A)", "page_yield": 3100, "printers": "HP LaserJet Pro M402, MFP M426"},
      {"code": "MX-26X (CF226X)", "page_yield": 9000, "printers": "HP LaserJet Pro M402, MFP M426 (High Yield)"},
      {"code": "MX-05A (CE505A)", "page_yield": 2300, "printers": "HP LaserJet P2035, P2055"}
    ],
    "key_advantages": [
      "Harga 40% - 50% lebih hemat dibanding cartridge Original OEM",
      "Garansi 100% Tukar Baru jika terjadi cacat cetak atau bocor",
      "Perlindungan Mesin: Jaminan penggantian suku cadang/perbaikan jika kerusakan terbukti akibat toner Orimax",
      "Kerapatan hitam pekat (Optical Density 1.45) dan tidak meninggalkan residu bubuk pada drum printer",
      "Terdaftar resmi di e-Katalog LKPP / Inaproc P3DN"
    ],
    "target_users": "Instansi pemerintah, dinas pendidikan, RSUD, bagian keuangan, dan perbankan yang memiliki volume cetak tinggi."
  }'::jsonb,
  1, 'PUBLISHED', true
WHERE NOT EXISTS (
  SELECT 1 FROM trainer_product_knowledge WHERE name = 'Toner Cartridge Compatible Orimax (Seri HP MX-85A, MX-83A, MX-26A, MX-05A)'
);

INSERT INTO trainer_product_knowledge (category, name, payload, version, status, active)
SELECT
  'Toner Cartridge & Consumables',
  'Toner Cartridge Compatible Orimax Brother Series (MX-TN2380 / MX-TN3448)',
  '{
    "brand": "ORIMAX",
    "manufacturer": "PT Aston Graphindo Indonesia",
    "tkdn_percentage": 41.50,
    "fast_moving_models": [
      {"code": "MX-TN2380", "page_yield": 2600, "printers": "Brother HL-L2360DN, HL-L2365DW, DCP-L2540DW, MFC-L2700DW"},
      {"code": "MX-TN3448", "page_yield": 8000, "printers": "Brother HL-L5100DN, HL-L6200DW, MFC-L5900DW"}
    ],
    "key_advantages": [
      "Dirancang presisi untuk sistem toner dan drum terpisah (separate drum & toner) Brother",
      "Tidak membuat roller penarik kertas selip atau kotor",
      "Hasil cetak dokumen teks, barcode, dan grafik tajam hingga halaman terakhir",
      "Tersedia di e-Katalog LKPP sektor peralatan perkantoran"
    ]
  }'::jsonb,
  1, 'PUBLISHED', true
WHERE NOT EXISTS (
  SELECT 1 FROM trainer_product_knowledge WHERE name = 'Toner Cartridge Compatible Orimax Brother Series (MX-TN2380 / MX-TN3448)'
);

INSERT INTO trainer_product_knowledge (category, name, payload, version, status, active)
SELECT
  'Interactive Flat Panel (IFP)',
  'Orimax Interactive Flat Panel (IFP) 65" / 75" / 86" 4K UHD',
  '{
    "brand": "ORIMAX",
    "manufacturer": "PT Aston Graphindo Indonesia",
    "tkdn_percentage": 44.15,
    "tkdn_certificate": "Kemenperin RI Terdaftar Resmi",
    "screen_sizes": ["65 inch (Ruang Kelas / Meeting Kecil)", "75 inch (Command Center / Ruang Rapat Dinas)", "86 inch (Aula / Auditorium)"],
    "specifications": {
      "resolution": "4K Ultra HD (3840 x 2160) Anti-Glare Glass",
      "touch_points": "40 Touch Points IR Ultra-Fast Response",
      "dual_os": "Android 13.0 + Windows 11 Pro OPS (Intel Core i5/i7, 16GB RAM, 512GB SSD)",
      "camera": "48 MP ePTZ Camera AI Auto-Framing",
      "microphone": "8-Beam Forming Microphone Array (Radius tangkap 10-12 meter)",
      "connectivity": "HDMI In/Out, USB Type-C Full Feature (65W Charging), RJ45 LAN, Wi-Fi 6, Bluetooth 5.2"
    },
    "key_advantages": [
      "Lolos aturan pengadaan TKDN P3DN pemerintah (BPK/Inspektorat safe)",
      "Sudah termasuk software papan tulis interaktif (Whiteboard Suite) tanpa lisensi tahunan",
      "Wireless Screen Sharing mendukung hingga 9 perangkat bersamaan (Windows, Mac, iOS, Android)",
      "Garansi purna jual 3 tahun on-site service resmi PT Aston Graphindo Indonesia"
    ]
  }'::jsonb,
  1, 'PUBLISHED', true
WHERE NOT EXISTS (
  SELECT 1 FROM trainer_product_knowledge WHERE name = 'Orimax Interactive Flat Panel (IFP) 65" / 75" / 86" 4K UHD'
);

INSERT INTO trainer_product_knowledge (category, name, payload, version, status, active)
SELECT
  'Managed Print Service (MPS)',
  'Orimax Managed Print Services (MPS) & Rental Printer / Mesin Fotokopi Dinas',
  '{
    "service_name": "ORIMAX Managed Print Solutions",
    "provider": "PT Aston Graphindo Indonesia",
    "service_models": [
      "Paket Click-Charge (Hanya bayar per lembar cetak)",
      "Paket Sewa Bulanan All-in (Flat rate per unit)"
    ],
    "inclusions": [
      "Gratis unit mesin printer / multifunction printer (print, scan, copy, duplex)",
      "Gratis toner cartridge Orimax tanpa batas (unlimited supply)",
      "Gratis penggantian spare part, drum unit, roller, dan fuser kit",
      "Teknisi stanby & komitmen Service Level Agreement (SLA) perbaikan maksimal 4 jam",
      "Penyediaan mesin pengganti (backup unit) jika kerusakan tidak selesai dalam 24 jam"
    ],
    "financial_benefits": [
      "Mengubah belanja modal (CAPEX) menjadi belanja operasional (OPEX) yang terprediksi",
      "Menghilangkan biaya penyusutan aset dan kerugian inventaris printer bekas/rusak",
      "Transparansi pelaporan cetak bulanan per bagian/bidang"
    ]
  }'::jsonb,
  1, 'PUBLISHED', true
WHERE NOT EXISTS (
  SELECT 1 FROM trainer_product_knowledge WHERE name = 'Orimax Managed Print Services (MPS) & Rental Printer / Mesin Fotokopi Dinas'
);


-- -----------------------------------------------------------------------------
-- 2. PERSONAS INSTANSI REALISTIS (B2G & B2B)
-- -----------------------------------------------------------------------------

INSERT INTO trainer_personas (
  name, type, role, attitude, communication_style, knowledge_level, interest_level, urgency, existing_vendor, budget_condition, default_resistance, active
)
SELECT
  'dr. Suryo — PPK RSUD Umum Daerah', 'ppk_rsud', 'Pejabat Pembuat Komitmen Pengadaan RSUD',
  'skeptical_hygienic', 'pragmatic_clinical', 'high', 'medium', 'high', 'Vendor Resmi Cartridge OEM', 'blud_terbatas', 4, true
WHERE NOT EXISTS (SELECT 1 FROM trainer_personas WHERE type = 'ppk_rsud');

INSERT INTO trainer_personas (
  name, type, role, attitude, communication_style, knowledge_level, interest_level, urgency, existing_vendor, budget_condition, default_resistance, active
)
SELECT
  'Pak Ridwan — Pejabat Pengadaan Diskominfo', 'pejabat_diskominfo', 'Pejabat Pengadaan / Pokja IT Diskominfo',
  'strictly_technical', 'analytical_detail', 'high', 'medium', 'medium', 'Merek Impor Non-TKDN', 'apbd_tersedia_rup', 4, true
WHERE NOT EXISTS (SELECT 1 FROM trainer_personas WHERE type = 'pejabat_diskominfo');

INSERT INTO trainer_personas (
  name, type, role, attitude, communication_style, knowledge_level, interest_level, urgency, existing_vendor, budget_condition, default_resistance, active
)
SELECT
  'Ibu Wahyuni — Kasubag Perlengkapan Setda', 'kasubag_setda', 'Kasubag Umum & Perlengkapan Sekretariat Daerah',
  'loyal_rekanan_lama', 'polite_bureaucratic', 'medium', 'low', 'low', 'Toko CV Rekanan Pemda 5 Tahun', 'apbd_rutin', 5, true
WHERE NOT EXISTS (SELECT 1 FROM trainer_personas WHERE type = 'kasubag_setda');

INSERT INTO trainer_personas (
  name, type, role, attitude, communication_style, knowledge_level, interest_level, urgency, existing_vendor, budget_condition, default_resistance, active
)
SELECT
  'Pak Teguh — Purchasing Manager PT Sinar Logistik', 'purchasing_b2b', 'Head of Procurement & Purchasing Korporasi',
  'cost_driven', 'fast_direct', 'medium', 'high', 'high', 'Cartridge Original HP / Canon Toko Retail', 'efisiensi_op_cost', 3, true
WHERE NOT EXISTS (SELECT 1 FROM trainer_personas WHERE type = 'purchasing_b2b');

INSERT INTO trainer_personas (
  name, type, role, attitude, communication_style, knowledge_level, interest_level, urgency, existing_vendor, budget_condition, default_resistance, active
)
SELECT
  'Mbak Siti — Resepsionis Dinas PUPR', 'gatekeeper_strict', 'Resepsionis Front Desk Dinas PUPR',
  'hurried_dismissive', 'abrupt', 'low', 'low', 'low', 'Unknown', 'unknown', 5, true
WHERE NOT EXISTS (SELECT 1 FROM trainer_personas WHERE type = 'gatekeeper_strict');


-- -----------------------------------------------------------------------------
-- 3. EKSPANSI 15 SKENARIO BARU (5 MODUL)
-- -----------------------------------------------------------------------------

-- MOD-01: Cold Call ke PPK RSUD
INSERT INTO trainer_scenarios (
  module_id, name, description, persona_id, difficulty, resistance_level,
  product_category, institution_type, objective, success_criteria,
  failure_criteria, rup_context_required, status, active, version,
  theory_briefing, passing_tips
)
SELECT
  m.id,
  'Cold Call ke PPK RSUD — Pengadaan Toner Rekam Medis & Farmasi',
  'PPK RSUD menerima telepon penawaran toner cartridge. Karakter sangat berhati-hati karena printer di kasir dan poli rawat jalan tidak boleh macet.',
  p.id,
  'intermediate', 4,
  'Toner Cartridge & Consumables', 'Rumah Sakit Umum Daerah (RSUD)',
  'Membangun trust dalam 60 detik pertama, mengaitkan pagu RUP toner RSUD dengan garansi printer tidak rusak, dan mengamankan janji temu teknis atau pengiriman sampel.',
  'Sales membuka dengan referensi RUP RSUD, menjelaskan jaminan garansi mesin printer pengganti jika rusak, dan meminta waktu diskusi teknis tanpa memaksa harga.',
  'Sales langsung menyebut diskon harga di awal, tidak tahu volume cetak RSUD, atau mengabaikan kekhawatiran higienitas/debu toner di lingkungan medis.',
  true, 'PUBLISHED', true, 1,
  'TIPS KHUSUS RSUD: Rumah sakit beroperasi 24 jam nonstop. Ketakutan terbesar PPK RSUD bukan harga, melainkan risiko printer rekam medis macet saat antrian pasien membludak. Tunjukkan bahwa Orimax memberikan garansi ganti unit printer dan servis cepat.',
  '1. Awali dengan menyebut nama paket pengadaan ATK/Toner RSUD dari SirUP. 2. Tekankan bahwa Orimax bersertifikasi ISO 14001 dan tidak menghasilkan serbuk toner bocor. 3. Tawarkan sampel gratis 1 unit untuk dicoba di bagian administrasi rekam medis.'
FROM trainer_modules m, (SELECT id FROM trainer_personas WHERE type = 'ppk_rsud' LIMIT 1) p
WHERE m.code = 'MOD-01'
  AND NOT EXISTS (SELECT 1 FROM trainer_scenarios WHERE name = 'Cold Call ke PPK RSUD — Pengadaan Toner Rekam Medis & Farmasi');

-- MOD-01: First Pitch Kasubag Setda
INSERT INTO trainer_scenarios (
  module_id, name, description, persona_id, difficulty, resistance_level,
  product_category, institution_type, objective, success_criteria,
  failure_criteria, rup_context_required, status, active, version,
  theory_briefing, passing_tips
)
SELECT
  m.id,
  'First Pitch Kasubag Setda — Efisiensi Anggaran ATK Kantor Bupati/Walikota',
  'Kasubag Umum Setda memiliki mobilitas tinggi dan terbiasa dengan rekanan lama. Sales harus menunjukkan nilai tambah efisiensi 40% dan kepatuhan audit.',
  p.id,
  'intermediate', 4,
  'Toner Cartridge & Consumables', 'Sekretariat Daerah (Setda)',
  'Mendapatkan persetujuan Kasubag untuk menerima kajian perbandingan anggaran (cost saving simulation) toner Setda.',
  'Sales sopan, mengapresiasi kesibukan Kasubag, menyebutkan kode RUP Setda, dan menawarkan simulasi penghematan anggaran yang bisa dilaporkan ke Sekda.',
  'Sales memaksa meminta nomor pribadi Sekda, berbicara berbelit-belit, atau mendiskreditkan rekanan lama Setda.',
  true, 'PUBLISHED', true, 1,
  'PEJABAT SETDA SANGAT SIBUK: Pejabat di Setda melayani pimpinan daerah (Bupati/Walikota/Sekda). Mereka membutuhkan vendor yang dokumennya rapi, barang selalu ready stock, dan memberikan laporan efisiensi yang mempercantik kinerja penyerapan anggaran dinas.',
  '1. Gunakan panggilan formal yang sangat hormat. 2. Sampaikan bahwa Orimax sudah terdaftar di e-Katalog LKPP sektor P3DN. 3. Minta izin mengirimkan lembar komparasi efisiensi anggaran 1 lembar via WhatsApp resmi.'
FROM trainer_modules m, (SELECT id FROM trainer_personas WHERE type = 'kasubag_setda' LIMIT 1) p
WHERE m.code = 'MOD-01'
  AND NOT EXISTS (SELECT 1 FROM trainer_scenarios WHERE name = 'First Pitch Kasubag Setda — Efisiensi Anggaran ATK Kantor Bupati/Walikota');

-- MOD-01: Cold Call B2B Korporasi
INSERT INTO trainer_scenarios (
  module_id, name, description, persona_id, difficulty, resistance_level,
  product_category, institution_type, objective, success_criteria,
  failure_criteria, rup_context_required, status, active, version,
  theory_briefing, passing_tips
)
SELECT
  m.id,
  'Cold Call B2B Korporasi — Solusi Efisiensi Biaya Cetak Gudang Logistik',
  'Purchasing Manager perusahaan logistik swasta yang mencetak puluhan ribu lembar surat jalan per bulan. Karakter to-the-point dan berorientasi profit.',
  p.id,
  'basic', 3,
  'Toner Cartridge & Consumables', 'Perusahaan Logistik & Pabrik Manufaktur',
  'Menawarkan program trial toner Orimax untuk printer cetak resi/surat jalan dan mengamankan jadwal demo cetak.',
  'Sales langsung menyajikan angka efisiensi cost-per-page (biaya per lembar) dan menawarkan trial unit gratis tanpa komitmen pembelian.',
  'Sales bertele-tele memakai bahasa birokrasi pemerintah ke klien korporasi swasta, atau tidak menguasai estimasi page yield toner.',
  false, 'PUBLISHED', true, 1,
  'B2B CORPORATE BUYER: Purchasing swasta tidak peduli RUP atau aturan birokrasi dinas; mereka hanya peduli: 1) Berapa rupiah hematnya per bulan? 2) Apakah kualitas barcode resi terbaca jelas oleh scanner? 3) Apa resikonya?',
  '1. Bicara cepat, tegas, dan percaya diri. 2. Langsung komparasikan: HP 85A/26A Original Rp 1 jutaan vs Orimax Rp 400 ribuan hemat hingga 60%. 3. Tawarkan garansi 1 unit tester gratis dikirim hari ini.'
FROM trainer_modules m, (SELECT id FROM trainer_personas WHERE type = 'purchasing_b2b' LIMIT 1) p
WHERE m.code = 'MOD-01'
  AND NOT EXISTS (SELECT 1 FROM trainer_scenarios WHERE name = 'Cold Call B2B Korporasi — Solusi Efisiensi Biaya Cetak Gudang Logistik');

-- MOD-02: Probing Spesifikasi Armada Printer
INSERT INTO trainer_scenarios (
  module_id, name, description, persona_id, difficulty, resistance_level,
  product_category, institution_type, objective, success_criteria,
  failure_criteria, rup_context_required, status, active, version,
  theory_briefing, passing_tips
)
SELECT
  m.id,
  'Probing Spesifikasi Armada Printer & Edukasi Garansi Mesin Orimax',
  'Pejabat teknis mencemaskan toner compatible merusak printer dinas yang baru dibeli tahun lalu. Sales harus membedah kebutuhan printer secara detail.',
  p.id,
  'intermediate', 3,
  'Toner Cartridge & Consumables', 'Dinas Pendidikan Kabupaten',
  'Mengidentifikasi tipe-tipe printer yang dipakai dinas (LaserJet HP, Brother) dan meyakinkan pejabat dengan sertifikasi ISO & klausul garansi mesin Orimax.',
  'Sales mengajukan pertanyaan terbuka terkait printer dinas, menjelaskan spesifikasi OPC drum dan smart chip Orimax, serta menegaskan garansi penggantian suku cadang.',
  'Sales meremehkan ketakutan dinas atau tidak tahu perbedaan antara refill suntikan pasar gelap dengan toner compatible pabrikan.',
  false, 'PUBLISHED', true, 1,
  'MENGAPA KLIEN TAKUT COMPATIBLE: Klien sering trauma pernah membeli cartridge isi ulang/refill murahan yang bocor merusak fuser film printer. Sales harus mampu menjelaskan bahwa Orimax adalah 100% cartridge baru berstandar pabrik ISO 9001, bukan barang daur ulang bekas.',
  '1. Tanyakan: Printer tipe apa saja yang menjadi tulang punggung pencetakan berkas? 2. Jelaskan program "Zero Risk Guarantee": jika printer rusak akibat toner kami, teknisi kami yang perbaiki atau ganti mesin setara.'
FROM trainer_modules m, (SELECT id FROM trainer_personas WHERE type = 'pptk_teknis' LIMIT 1) p
WHERE m.code = 'MOD-02'
  AND NOT EXISTS (SELECT 1 FROM trainer_scenarios WHERE name = 'Probing Spesifikasi Armada Printer & Edukasi Garansi Mesin Orimax');

-- MOD-02: Konsultasi IFP 75 Inch Diskominfo
INSERT INTO trainer_scenarios (
  module_id, name, description, persona_id, difficulty, resistance_level,
  product_category, institution_type, objective, success_criteria,
  failure_criteria, rup_context_required, status, active, version,
  theory_briefing, passing_tips
)
SELECT
  m.id,
  'Konsultasi Pengadaan IFP 75" TKDN untuk Command Center Diskominfo',
  'Pokja IT Diskominfo sedang menyusun spesifikasi interactive display untuk command center. Sangat kritis terhadap resolusi layar, OS, dan sertifikat TKDN.',
  p.id,
  'advanced', 4,
  'Interactive Flat Panel (IFP)', 'Dinas Komunikasi dan Informatika',
  'Memastikan spesifikasi Orimax IFP 75" (Dual OS Android 13 + Windows 11 OPS, TKDN 44.15%) masuk sebagai acuan Kerangka Acuan Kerja (KAK) dinas.',
  'Sales menguasai aspek teknis IFP (touch point, kamera ePTZ 48MP, microphone array), mampu menyebutkan nomor sertifikat TKDN Kemenperin, dan siap mengirim file brosur spesifikasi.',
  'Sales bingung saat ditanya spesifikasi OPS i5/i7, atau tidak bisa membuktikan persentase TKDN di atas 40%.',
  true, 'PUBLISHED', true, 1,
  'KOMINFO ADALAH USER TEKNIS: Mereka tidak bisa dipengaruhi gimmick marketing. Mereka memeriksa detail spesifikasi: port USB Type-C, versi Android, RAM/Storage, dan apakah software whiteboard berbayar lisensi tahunan atau gratis selamanya.',
  '1. Konfirmasi ukuran ruangan command center (jarak pandang 5-8 meter ideal untuk 75 atau 86 inch). 2. Tegaskan keunggulan Orimax IFP yang sudah Dual OS dan bebas biaya lisensi software seumur hidup. 3. Kirim sertifikat TKDN resmi Kemenperin.'
FROM trainer_modules m, (SELECT id FROM trainer_personas WHERE type = 'pejabat_diskominfo' LIMIT 1) p
WHERE m.code = 'MOD-02'
  AND NOT EXISTS (SELECT 1 FROM trainer_scenarios WHERE name = 'Konsultasi Pengadaan IFP 75" TKDN untuk Command Center Diskominfo');

-- MOD-02: Analisis Sewa Mesin Fotokopi vs Beli Putus
INSERT INTO trainer_scenarios (
  module_id, name, description, persona_id, difficulty, resistance_level,
  product_category, institution_type, objective, success_criteria,
  failure_criteria, rup_context_required, status, active, version,
  theory_briefing, passing_tips
)
SELECT
  m.id,
  'Konsultasi Transisi Beli Putus ke Managed Print Service (Rental Printer Dinas)',
  'PPK mengeluhkan biaya perawatan printer kantor yang membengkak tiap tahun karena sering rusak dan spare part mahal. Sales mengarahkan solusi sewa MPS.',
  p.id,
  'advanced', 3,
  'Managed Print Service (MPS)', 'Badan Pendapatan Daerah (Bapenda)',
  'Membimbing pejabat melihat keuntungan beralih ke sistem kontrak sewa mesin per lembar (click-charge) tanpa pusing belanja toner dan servis.',
  'Sales membedah Total Cost of Ownership (TCO), memaparkan manfaat free toner dan free teknisi, serta menghitungkan estimasi penghematan APBD.',
  'Sales hanya fokus menjual unit printer baru dan tidak peka terhadap problem beban pemeliharaan dinas.',
  false, 'PUBLISHED', true, 1,
  'MANAGED PRINT SERVICE (MPS): Tren pengadaan instansi modern beralih dari belanja printer fisik ke belanja sewa layanan. Pejabat senang karena tidak perlu mengurus lelang perbaikan printer rusak atau stok toner menumpuk di gudang.',
  '1. Gali keluhan: Berapa juta per tahun dinas mengeluarkan anggaran untuk servis printer dan ganti spare part? 2. Paparkan solusi Orimax MPS: Dinas cukup sediakan kertas, mesin + toner + teknisi 100% disediakan dan dirawat Orimax.'
FROM trainer_modules m, (SELECT id FROM trainer_personas WHERE type = 'ppk_pejabat' LIMIT 1) p
WHERE m.code = 'MOD-02'
  AND NOT EXISTS (SELECT 1 FROM trainer_scenarios WHERE name = 'Konsultasi Transisi Beli Putus ke Managed Print Service (Rental Printer Dinas)');

-- MOD-03: Menembus Resepsionis Jutek PUPR
INSERT INTO trainer_scenarios (
  module_id, name, description, persona_id, difficulty, resistance_level,
  product_category, institution_type, objective, success_criteria,
  failure_criteria, rup_context_required, status, active, version,
  theory_briefing, passing_tips
)
SELECT
  m.id,
  'Menembus Resepsionis Jutek yang Menolak Memberikan Nomor PPK',
  'Resepsionis bersikap dingin dan langsung memotong: "Kirim email saja ke info@dinas, pejabat tidak menerima telepon sembarangan". Sales harus tetap tenang dan cerdik.',
  p.id,
  'intermediate', 5,
  'Toner Cartridge & Consumables', 'Dinas Pekerjaan Umum dan Penataan Ruang (PUPR)',
  'Tidak menyerah pada penolakan pertama, mengubah percakapan menjadi urusan koordinasi verifikasi dokumen RUP, dan mendapatkan nama Kasubag/PPK.',
  'Sales tetap tenang, tidak mendebat, mengonfirmasi nama penerima email di bagian pengadaan agar email tidak salah kamar, dan memancing ekstensi telepon langsung.',
  'Sales emosional, membentak resepsionis, atau langsung pasrah menutup telepon saat disuruh kirim email.',
  false, 'PUBLISHED', true, 1,
  'JANGAN PERNAH LAWAN RESEPSIONIS: Resepsionis adalah penyaring pertama. Jika Anda berdebat, pintu tertutup selamanya. Kuncinya adalah menyetujui arahannya ("Baik Mbak, tentu kami kirim email"), lalu meminta detail penerima: "Agar disposisinya tepat ke meja Pejabat Pengadaan yang menangani paket ini, boleh saya tahu nama beliau?"',
  '1. Suara ramah, santai, dan bersahabat. 2. Jangan terintimidasi nada ketus resepsionis. 3. Gunakan kata kunci: "koordinasi kelengkapan dokumen pengadaan RUP".'
FROM trainer_modules m, (SELECT id FROM trainer_personas WHERE type = 'gatekeeper_strict' LIMIT 1) p
WHERE m.code = 'MOD-03'
  AND NOT EXISTS (SELECT 1 FROM trainer_scenarios WHERE name = 'Menembus Resepsionis Jutek yang Menolak Memberikan Nomor PPK');

-- MOD-03: Melewati Sekretaris Protokoler
INSERT INTO trainer_scenarios (
  module_id, name, description, persona_id, difficulty, resistance_level,
  product_category, institution_type, objective, success_criteria,
  failure_criteria, rup_context_required, status, active, version,
  theory_briefing, passing_tips
)
SELECT
  m.id,
  'Melewati Sekretaris Protokoler yang Melindungi Jadwal Pimpinan Dinas',
  'Sekretaris Kepala Dinas sangat protektif: "Bapak Kepala sedang padat jadwal rapat, nomor HP beliau rahasia dinas". Sales harus mengalihkan pembicaraan ke level PPK/PPTK.',
  p.id,
  'intermediate', 4,
  'Toner Cartridge & Consumables', 'Dinas Kesehatan Provinsi',
  'Menjelaskan bahwa sales tidak berniat mengganggu Kepala Dinas, melainkan ingin berkoordinasi dengan pejabat pelaksana teknis pengadaan (PPK/PPTK).',
  'Sales menghargai protokoler dinas, menyampaikan bahwa urusan teknis cukup dikoordinasikan dengan staf pengadaan/PPK, dan meminta diarahkan ke ruangan yang bersangkutan.',
  'Sales ngotot minta nomor HP pribadi Kepala Dinas atau berbohong mengaku kerabat dekat.',
  false, 'PUBLISHED', true, 1,
  'RESPEK PADA PROTOKOLER: Sekretaris pimpinan bangga melindungi bosnya. Katakan Anda mengerti kesibukan Kepala Dinas dan tidak ingin membebani beliau dengan urusan spesifikasi barang, sehingga ingin diarahkan ke PPTK teknis.',
  '1. Tunjukkan empati: "Tentu Ibu, kami sangat paham agenda Bapak Kadis sangat padat." 2. Pindahkan fokus: "Oleh karena itu kami cukup berkoordinasi dengan Pejabat Pelaksana Teknis Kegiatan (PPTK) di bagian Sarpras, boleh dibantu disambungkan ke sana Ibu?"'
FROM trainer_modules m, (SELECT id FROM trainer_personas WHERE type = 'government_cs' LIMIT 1) p
WHERE m.code = 'MOD-03'
  AND NOT EXISTS (SELECT 1 FROM trainer_scenarios WHERE name = 'Melewati Sekretaris Protokoler yang Melindungi Jadwal Pimpinan Dinas');

-- MOD-04: Follow-Up Pasca Kirim Sampel Toner
INSERT INTO trainer_scenarios (
  module_id, name, description, persona_id, difficulty, resistance_level,
  product_category, institution_type, objective, success_criteria,
  failure_criteria, rup_context_required, status, active, version,
  theory_briefing, passing_tips
)
SELECT
  m.id,
  'Follow-Up Pasca Kirim Sampel Toner ke Bagian Perlengkapan RSUD',
  'Dua minggu lalu sales mengirimkan 1 unit sample toner Orimax MX-85A ke RSUD. Sales menelepon kembali untuk meminta feedback hasil cetak dan mengunci order.',
  p.id,
  'intermediate', 3,
  'Toner Cartridge & Consumables', 'RSUD Daerah',
  'Mengevaluasi hasil pemakaian sampel oleh staf rumah sakit dan mengajak PPK memasukkan kebutuhan toner Orimax ke pesanan e-katalog.',
  'Sales menanyakan pengalaman spesifik pengguna (kehitaman cetak, kebersihan kertas), meminta feedback jujur, dan menjadwalkan penawaran paket resmi.',
  'Sales menanyakan dengan nada menagih pesanan, tidak peduli apakah sampel sudah dicoba atau belum.',
  false, 'PUBLISHED', true, 1,
  'FOLLOW-UP SAMPEL = KONSULTATIF BUKAN MENAGIH: Jangan tanya "Kapan mau beli Pak?". Tanyakan: "Bagaimana hasil cetak sampel toner Orimax yang kemarin dicoba di printer poli rekam medis? Apakah ada kendala pada kepekatan teksnya?". Biarkan mereka memuji kualitasnya sendiri.',
  '1. Tanyakan siapa staf yang langsung menguji toner tersebut. 2. Jika ada keluhan kecil, tanggapi dengan solusi garansi langsung. 3. Konfirmasi kesiapan proses klik e-katalog.'
FROM trainer_modules m, (SELECT id FROM trainer_personas WHERE type = 'ppk_rsud' LIMIT 1) p
WHERE m.code = 'MOD-04'
  AND NOT EXISTS (SELECT 1 FROM trainer_scenarios WHERE name = 'Follow-Up Pasca Kirim Sampel Toner ke Bagian Perlengkapan RSUD');

-- MOD-04: Mengatasi Penundaan Anggaran APBD-P
INSERT INTO trainer_scenarios (
  module_id, name, description, persona_id, difficulty, resistance_level,
  product_category, institution_type, objective, success_criteria,
  failure_criteria, rup_context_required, status, active, version,
  theory_briefing, passing_tips
)
SELECT
  m.id,
  'Mengatasi Penundaan Anggaran "Pagu Digeser ke Tahun Depan"',
  'Pejabat mengabarkan pengadaan ATK/Toner terancam ditunda karena pergeseran anggaran daerah (APBD-Perubahan). Sales harus menjaga prospek tetap hidup.',
  p.id,
  'advanced', 4,
  'Toner Cartridge & Consumables', 'Dinas Komunikasi dan Informatika',
  'Menjaga hubungan hangat, menawarkan bantuan penyusunan HPS/spek untuk DPA tahun anggaran berikutnya, dan mengamankan status Orimax sebagai vendor prioritas.',
  'Sales bersikap suportif terhadap kendala APBD dinas, tidak memaksakan closing sekarang, dan meminta izin memasukkan draf spesifikasi Orimax ke RKA awal tahun.',
  'Sales menunjukkan rasa kesal, mengabaikan kondisi dinas, atau memutus kontak komunikasi begitu mendengar anggaran ditunda.',
  false, 'PUBLISHED', true, 1,
  'PERGESERAN ANGGARAN ADALAH HAL BIASA DI B2G: Jangan tinggalkan pejabat saat anggaran mereka dipotong. Pejabat akan mengingat vendor yang tetap mendampingi mereka saat sulit. Kunci kemenangan proyek tahun depan dimulai dari penyusunan RKA di bulan Oktober-November.',
  '1. Tunjukkan empati terhadap dinamika anggaran dinas. 2. Tawarkan bantuan menyiapkan dokumen spesifikasi teknis dan HPS untuk DPA induk Januari mendatang. 3. Tetapkan jadwal kontak berikutnya pada saat penetapan APBD.'
FROM trainer_modules m, (SELECT id FROM trainer_personas WHERE type = 'pejabat_diskominfo' LIMIT 1) p
WHERE m.code = 'MOD-04'
  AND NOT EXISTS (SELECT 1 FROM trainer_scenarios WHERE name = 'Mengatasi Penundaan Anggaran "Pagu Digeser ke Tahun Depan"');

-- MOD-04: Re-aktivasi Klien Dormant
INSERT INTO trainer_scenarios (
  module_id, name, description, persona_id, difficulty, resistance_level,
  product_category, institution_type, objective, success_criteria,
  failure_criteria, rup_context_required, status, active, version,
  theory_briefing, passing_tips
)
SELECT
  m.id,
  'Re-Aktivasi Klien Dormant — Dinas yang Tidak Repeat Order Selama 6 Bulan',
  'Dinas yang tahun lalu rutin membeli toner Orimax, namun 6 bulan terakhir tidak ada repeat order. Sales menelepon untuk service check dan menggali akar masalah.',
  p.id,
  'intermediate', 3,
  'Toner Cartridge & Consumables', 'Sekretariat DPRD Kota',
  'Mengidentifikasi apakah ada pergantian pejabat pengadaan atau komplain teknis terpendam, serta memulihkan hubungan kemitraan.',
  'Sales membuka dengan apresiasi kerja sama masa lalu, menanyakan kabar performa unit printer, mendengarkan aktif, dan menawarkan promo refresh stok.',
  'Sales bersikap menuduh mengapa dinas pindah ke toko lain, atau langsung jualan tanpa menanyakan kendala.',
  false, 'PUBLISHED', true, 1,
  'DORMANT ACCOUNT CHECK: Seringkali dinas tidak repeat order bukan karena tidak butuh, tapi karena: 1) Ada pergantian Pejabat Pengadaan / Staf Baru yang belum kenal nomor kontak kita, atau 2) Ada satu toner yang bermasalah tapi mereka malas komplain. Datang sebagai penolong yang siap merapikan armada cetak mereka.',
  '1. Konfirmasi nama pejabat yang saat ini memegang kendali pengadaan. 2. Tanyakan kepuasan pemakaian toner sebelumnya. 3. Berikan update produk baru atau garansi free maintenance.'
FROM trainer_modules m, (SELECT id FROM trainer_personas WHERE type = 'pptk_teknis' LIMIT 1) p
WHERE m.code = 'MOD-04'
  AND NOT EXISTS (SELECT 1 FROM trainer_scenarios WHERE name = 'Re-Aktivasi Klien Dormant — Dinas yang Tidak Repeat Order Selama 6 Bulan');

-- MOD-05: Mengatasi Keberatan Rekanan Lama
INSERT INTO trainer_scenarios (
  module_id, name, description, persona_id, difficulty, resistance_level,
  product_category, institution_type, objective, success_criteria,
  failure_criteria, rup_context_required, status, active, version,
  theory_briefing, passing_tips
)
SELECT
  m.id,
  'Menembus Keberatan "Kami Sudah Nyaman dengan Rekanan Lama Selama 5 Tahun"',
  'Kasubag Setda menolak halus karena sudah bertahun-tahun berlangganan di toko rekanan lokal. Sales harus membuka celah tanpa menyinggung rekanan lama.',
  p.id,
  'expert', 5,
  'Toner Cartridge & Consumables', 'Sekretariat Daerah (Setda)',
  'Mendapatkan alokasi pesanan uji coba (split order 20-30%) dengan memanfaatkan instrumen kepatuhan TKDN dan audit efisiensi anggaran BPK.',
  'Sales menghargai loyalitas dinas terhadap mitra lokal, namun secara elegan menawarkan uji coba pembanding efisiensi belanja daerah dan kelengkapan sertifikat TKDN LKPP.',
  'Sales menyerang atau menjelek-jelekkan rekanan lama, memicu defensif pejabat, atau langsung menyerah.',
  false, 'PUBLISHED', true, 1,
  'STRATEGI SPLIT ORDER: Jangan minta dinas memutus hubungan dengan rekanan lama 100%. Itu berisiko bagi mereka. Minta alokasi kecil (pilot project 20%): "Ibu tidak perlu memutus kerja sama dengan toko langganan. Cukup alokasikan 20% kebutuhan toner triwulan ini ke Orimax untuk membuktikan penghematan anggaran yang bisa Ibu laporkan ke Inspektorat."',
  '1. Puji hubungan dinas dengan rekanan lama ("Luar biasa Ibu, loyalitas kerja sama itu sangat penting"). 2. Masuk melalui sudut pandang aturan TKDN pemerintah: "Sebagai instansi pemerintah, tentu Setda juga perlu menunjukkan komitmen penggunaan produk ber-TKDN resmi". 3. Tawarkan split order 10-20 unit terlebih dahulu.'
FROM trainer_modules m, (SELECT id FROM trainer_personas WHERE type = 'kasubag_setda' LIMIT 1) p
WHERE m.code = 'MOD-05'
  AND NOT EXISTS (SELECT 1 FROM trainer_scenarios WHERE name = 'Menembus Keberatan "Kami Sudah Nyaman dengan Rekanan Lama Selama 5 Tahun"');

-- MOD-05: Handling Keberatan Trauma Compatible Bocor
INSERT INTO trainer_scenarios (
  module_id, name, description, persona_id, difficulty, resistance_level,
  product_category, institution_type, objective, success_criteria,
  failure_criteria, rup_context_required, status, active, version,
  theory_briefing, passing_tips
)
SELECT
  m.id,
  'Handling Keberatan "Pernah Pakai Merek Compatible Lain Bocor & Merusak Printer"',
  'PPK RSUD menolak keras karena pengalaman buruk masa lalu menggunakan cartridge compatible non-resmi yang bocor mengotori sensor printer.',
  p.id,
  'advanced', 4,
  'Toner Cartridge & Consumables', 'RSUD Daerah',
  'Menjelaskan perbedaan sertifikasi pabrikan Orimax vs cartridge rekondisi murah, serta mengunci kesepakatan dengan Surat Pernyataan Tanggung Jawab Mutu.',
  'Sales memvalidasi kekhawatiran klien, menjelaskan standar ISO 9001 Orimax dengan komponen 100% baru, dan menawarkan jaminan penggantian unit printer baru jika rusak.',
  'Sales membantah bahwa compatible tidak pernah bocor, atau menyalahkan operator printer dinas.',
  false, 'PUBLISHED', true, 1,
  'VALIDASI KETAKUTAN KLIEN: Klien yang pernah kecewa butuh kepastian hitam di atas putih. Jelaskan bahwa di pasaran banyak yang mengaku compatible padahal toner suntik daur ulang (refill remanufactured) tanpa uji kebocoran chamber. Orimax adalah cartridge manufactured baru dengan QC cetak 100%.',
  '1. Mulai dengan validasi: "Saya sangat paham Pak, jika saya di posisi Bapak, saya pun akan marah jika ada toner bocor merusak aset rumah sakit." 2. Berikan bukti sertifikasi ISO 9001 pabrik PT Aston Graphindo Indonesia. 3. Lampirkan surat jaminan garansi printer resmi bermaterai.'
FROM trainer_modules m, (SELECT id FROM trainer_personas WHERE type = 'ppk_rsud' LIMIT 1) p
WHERE m.code = 'MOD-05'
  AND NOT EXISTS (SELECT 1 FROM trainer_scenarios WHERE name = 'Handling Keberatan "Pernah Pakai Merek Compatible Lain Bocor & Merusak Printer"');

-- MOD-05: Closing Kilat E-Purchasing Akhir Tahun
INSERT INTO trainer_scenarios (
  module_id, name, description, persona_id, difficulty, resistance_level,
  product_category, institution_type, objective, success_criteria,
  failure_criteria, rup_context_required, status, active, version,
  theory_briefing, passing_tips
)
SELECT
  m.id,
  'Closing Kilat E-Purchasing Akhir Tahun — Penyerapan Sisa Anggaran Kas Daerah',
  'Pejabat Pokja/PPK dikejar deadline tutup buku kasda akhir tahun (Desember). Butuh kepastian stok fisik barang dan kecepatan pengiriman e-katalog.',
  p.id,
  'expert', 4,
  'Toner Cartridge & Consumables', 'Badan Perencanaan Pembangunan Daerah (Bappeda)',
  'Menuntun pejabat melakukan klik e-Purchasing hari ini dengan jaminan pengiriman 1x24 jam dan kelengkapan faktur pajak sebelum deadline kasda.',
  'Sales memberikan ID produk e-katalog LKPP yang tepat, menjamin kesiapan resi pengiriman instan, dan memandu tahapan verifikasi pesanan sistem.',
  'Sales ragu-ragu soal stok barang, tidak paham mekanisme e-purchasing LKPP, atau lambat merespon dokumen faktur.',
  true, 'PUBLISHED', true, 1,
  'DEADLINE TUTUP BUKU AKHIR TAHUN: Pada kuartal 4 (Oktober - Desember), pejabat dinas tidak lagi memikirkan negosiasi harga panjang. Prioritas nomor 1 mereka adalah: "Apakah barang bisa sampai sebelum tanggal 20 Desember dan berkas penagihan SP2D bisa cair?". Berikan kepastian logistik 100%.',
  '1. Konfirmasi sisa pagu anggaran dan tanggal cut-off kasda dinas. 2. Berikan ID komoditas e-katalog Orimax siap klik. 3. Tunjukkan bukti surat komitmen pengiriman kilat 1x24 jam langsung dari gudang terdekat.'
FROM trainer_modules m, (SELECT id FROM trainer_personas WHERE type = 'pokja_pengadaan' LIMIT 1) p
WHERE m.code = 'MOD-05'
  AND NOT EXISTS (SELECT 1 FROM trainer_scenarios WHERE name = 'Closing Kilat E-Purchasing Akhir Tahun — Penyerapan Sisa Anggaran Kas Daerah');

COMMIT;
