# Panduan Kurikulum, Skenario & Knowledge Base AGI AI Sales Trainer (Versi 2026)

Dokumen ini menjelaskan struktur kurikulum, basis pengetahuan produk PT Aston Graphindo Indonesia (Orimax), ragam persona lawan bicara, dan 24 skenario roleplay pelatihan sales B2G & B2B yang aktif di sistem AGI AI Sales Trainer.

---

## 1. Katalog Produk Resmi Orimax (`trainer_product_knowledge`)

Basis pengetahuan ini diinjeksikan secara otomatis ke dalam System Prompt AI (Gemini Live & DeepSeek Evaluator) sehingga respon AI klien selalu akurat, faktual, dan selaras dengan produk riil perusahaan.

| Kategori | Produk & Tipe | TKDN & Sertifikasi | Keunggulan Utama untuk Pejabat / Klien |
| :--- | :--- | :--- | :--- |
| **Toner Cartridge & Consumables** | **Compatible HP Series**<br>MX-85A, MX-83A, MX-26A/X, MX-05A | **43.82%** (Kemenperin)<br>ISO 9001:2015, ISO 14001:2015 | Hemat 40-50% dibanding OEM. **Garansi Mesin:** Penggantian spare part jika printer rusak akibat toner. Kerapatan hitam pekat (Optical Density 1.45). Terdaftar di e-Katalog LKPP sektor P3DN. |
| **Toner Cartridge & Consumables** | **Compatible Brother Series**<br>MX-TN2380, MX-TN3448 | **41.50%** (Kemenperin) | Presisi untuk sistem *separate drum & toner* Brother. Tidak selip pada roller penarik kertas. |
| **Interactive Flat Panel (IFP)** | **Orimax IFP 65", 75", 86" 4K UHD** | **44.15%** (Kemenperin) | 4K Zero-bonding glass, 40 touch points. **Dual OS:** Android 13 + Windows 11 OPS (Core i5/i7, 16GB RAM, 512GB SSD). Kamera 48MP ePTZ + 8-Array Mic. Free software Whiteboard seumur hidup tanpa lisensi tahunan. Garansi 3 tahun on-site. |
| **Managed Print Service (MPS)** | **Orimax Rental Printer & Mesin Fotokopi Dinas** | Layanan Komprehensif PT Aston Graphindo Indonesia | Skema Click-Charge (bayar per lembar) atau Sewa Bulanan Flat. **All-in:** Unit gratis, toner gratis unlimited, teknisi siaga SLA 4 jam, unit backup pengganti dalam 24 jam jika perbaikan memakan waktu lama. |

---

## 2. Matriks Persona Instansi (`trainer_personas`)

Pelatihan menggunakan 9 persona dengan spektrum psikologis beragam, dari yang kooperatif hingga tingkat penolakan tinggi (*resistance level 5*):

1. **dr. Suryo — PPK RSUD Umum Daerah** (`ppk_rsud`):
   - *Karakter:* Skeptis terhadap produk non-OEM, sangat mengutamakan higienitas (tidak boleh bocor/berdebu di ruang medis) dan keandalan printer rekam medis 24 jam.
2. **Pak Ridwan — Pejabat Pengadaan Diskominfo** (`pejabat_diskominfo`):
   - *Karakter:* Sangat analitis, menguasai spesifikasi teknis (chip, port USB Type-C, resolusi 4K) dan regulasi audit BPK/Inspektorat terkait sertifikat TKDN resmi.
3. **Ibu Wahyuni — Kasubag Perlengkapan Setda** (`kasubag_setda`):
   - *Karakter:* Birokratis sopan, memiliki hubungan loyal 5 tahun dengan rekanan lama. Menolak halus perubahan vendor kecuali ada instruksi pimpinan atau bukti penghematan anggaran yang signifikan.
4. **Pak Teguh — Purchasing Manager Korporasi Swasta** (`purchasing_b2b`):
   - *Karakter:* To-the-point, fokus pada efisiensi biaya operasional (cost-per-page) dan kecepatan respon. Meminta sample trial gratis sebelum menerbitkan Purchase Order.
5. **Mbak Siti — Resepsionis Front Desk PUPR** (`gatekeeper_strict`):
   - *Karakter:* Jutek, sibuk, selalu mengarahkan vendor untuk kirim email umum (`info@dinas`) dan menolak memberikan nomor HP atau ekstensi pejabat.
6. **Pak Bambang — PPK Dinas Pendidikan** (`ppk_pejabat`):
   - *Karakter:* Pejabat senior yang sibuk, defensif terhadap penawaran harga massal, baru terbuka jika sales menyebut kode RUP spesifik.
7. **Ibu Ani — PPTK / Kasi Sarpras** (`pptk_teknis`):
   - *Karakter:* Detail, peduli terhadap kesesuaian barang dengan Kerangka Acuan Kerja (KAK) dan pertanggungjawaban audit.
8. **Pak Hendra — Kepala Tim Pokja / LPSE** (`pokja_pengadaan`):
   - *Karakter:* Sangat ketat pada prosedur e-purchasing LKPP, kepatuhan batas pagu, dan tenggat waktu pencairan kas daerah (kasda).
9. **Pak Garuda — CS Dinas** (`government_cs`):
   - *Karakter:* Staf umum ramah namun hati-hati menyambungkan telepon dari luar dinas.

---

## 3. Rincian 24 Skenario Roleplay Berdasarkan 5 Modul

### Modul 01: First Pitch & Cold Calling PPK/PPTK (`MOD-01`)
*Fokus: Mengaitkan pembuka telepon dengan kode RUP SirUP dan mengamankan izin diskusi teknis.*
1. **First Call ke PPK berdasarkan Kode RUP** (Pak Bambang, Diff: Medium, Res: 4)
2. **Cold Call ke PPK RSUD — Pengadaan Toner Rekam Medis & Farmasi** (dr. Suryo, Diff: Intermediate, Res: 4)
3. **First Pitch Kasubag Setda — Efisiensi Anggaran ATK Kantor Bupati/Walikota** (Ibu Wahyuni, Diff: Intermediate, Res: 4)
4. **Cold Call B2B Korporasi — Solusi Efisiensi Biaya Cetak Gudang Logistik** (Pak Teguh, Diff: Basic, Res: 3)

### Modul 02: Probing Spesifikasi Teknis & Kepatuhan TKDN (`MOD-02`)
*Fokus: Menggali kebutuhan barang, membedah regulasi P3DN/TKDN, dan konsultasi perlindungan garansi.*
1. **Konsultasi TKDN & Spesifikasi IFP / Interactive Flat Panel** (Ibu Ani, Diff: Hard, Res: 3)
2. **Probing Spesifikasi Armada Printer & Edukasi Garansi Mesin Orimax** (Ibu Ani, Diff: Intermediate, Res: 3)
3. **Konsultasi Pengadaan IFP 75" TKDN untuk Command Center Diskominfo** (Pak Ridwan, Diff: Advanced, Res: 4)
4. **Konsultasi Transisi Beli Putus ke Managed Print Service (Rental Printer Dinas)** (Pak Bambang, Diff: Advanced, Res: 3)

### Modul 03: Gatekeeper Handling (`MOD-03`)
*Fokus: Menembus resepsionis dan front office tanpa bersikap arogan untuk mendapatkan kontak PIC pengadaan.*
1. **Tembus CS Dinas — Minta Nama PIC** (Pak Garuda, Diff: Basic, Res: 3)
2. **CS Bertanya "Ini Perusahaan Apa?"** (Pak Garuda, Diff: Intermediate, Res: 4)
3. **CS Menolak Sambungkan — Soft Resistance** (Pak Garuda, Diff: Basic, Res: 4)
4. **Gatekeeper dengan Konteks RUP** (Pak Garuda, Diff: Intermediate, Res: 5)
5. **CS Minta Proposal Dikirim Dulu** (Pak Garuda, Diff: Basic, Res: 3)
6. **Menembus Resepsionis Jutek yang Menolak Memberikan Nomor PPK** (Mbak Siti, Diff: Intermediate, Res: 5)
7. **Melewati Sekretaris Protokoler yang Melindungi Jadwal Pimpinan Dinas** (Pak Garuda, Diff: Intermediate, Res: 4)

### Modul 04: Long-Cycle Nurturing & Re-engagement (`MOD-04`)
*Fokus: Merawat hubungan 1-3 bulan, mengantisipasi pergeseran APBD, dan membangunkan akun dormant.*
1. **Follow-Up Bulan ke-2 (Mengatasi Ghosting / Diam)** (Pak Bambang, Diff: Hard, Res: 4)
2. **Follow-Up Pasca Kirim Sampel Toner ke Bagian Perlengkapan RSUD** (dr. Suryo, Diff: Intermediate, Res: 3)
3. **Mengatasi Penundaan Anggaran "Pagu Digeser ke Tahun Depan"** (Pak Ridwan, Diff: Advanced, Res: 4)
4. **Re-Aktivasi Klien Dormant — Dinas yang Tidak Repeat Order Selama 6 Bulan** (Ibu Ani, Diff: Intermediate, Res: 3)

### Modul 05: Closing E-Purchasing & Handling Keberatan (`MOD-05`)
*Fokus: Menuntun klik e-Katalog LKPP, mengatasi perbandingan merek lain, dan menembus hegemoni rekanan lama.*
1. **Bimbingan Klik E-Katalog & Penanganan Komparasi Merek** (Pak Hendra, Diff: Expert, Res: 5)
2. **Handling Keberatan Harga Merek Lain & Pagu Terbatas** (Pak Bambang, Diff: Hard, Res: 5)
3. **Menembus Keberatan "Kami Sudah Nyaman dengan Rekanan Lama Selama 5 Tahun"** (Ibu Wahyuni, Diff: Expert, Res: 5)
4. **Handling Keberatan "Pernah Pakai Merek Compatible Lain Bocor & Merusak Printer"** (dr. Suryo, Diff: Advanced, Res: 4)
5. **Closing Kilat E-Purchasing Akhir Tahun — Penyerapan Sisa Anggaran Kas Daerah** (Pak Hendra, Diff: Expert, Res: 4)

---

## 4. Cara Penggunaan dalam Rapor Skill & Automated Drill

Jika seorang sales mendapatkan skor evaluasi di bawah standar ($\le 70$) pada Rapor Bulanan SIRUP Dashboard, sistem secara otomatis menerbitkan penugasan (*drill assignment*) ke modul yang tepat:
- Keberatan / Rekanan Lama $\rightarrow$ **MOD-05**
- Kurang Paham Produk / TKDN $\rightarrow$ **MOD-02**
- Pembuka Telepon Terbata-bata $\rightarrow$ **MOD-01**
- Macet di Resepsionis $\rightarrow$ **MOD-03**
- Prospek Hilang Tanpa Follow-up $\rightarrow$ **MOD-04**

Sales akan menerima notifikasi di aplikasi mobile Android AGI Sales Trainer dan langsung melakukan latihan roleplay suara interaktif (*voice-to-voice*) hingga mencapai nilai kelulusan minimal **80**.
