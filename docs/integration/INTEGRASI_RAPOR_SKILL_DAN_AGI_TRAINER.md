# SOP & DOKUMENTASI SISTEM: INTEGRASI RAPOR SKILL SALES & AGI AI SALES TRAINER
## Closed-Loop Coaching & Automated Training Engine
**PT. Aston Graphindo Indonesia / ORIMAX**  
*Versi: 1.0 · Tanggal: 28 Oktober 2026 · Target Pengguna: HRD, SPV Sales, Manager Sales, Sales Team, & IT*

---

## 1. Latar Belakang & Filosofi Sistem

Sebelum integrasi ini dibangun, perusahaan memiliki dua sistem terpisah:
1. **SIRUP Dashboard (`/spv/reports`)**: Mengevaluasi rekaman percakapan telepon sales nyata di lapangan dan mendeteksi kelemahan komunikasi (misal: gagal mengunci komitmen *closing*, terburu-buru presentasi tanpa *discovery*, atau ragu-ragu saat menangani penolakan harga).
2. **AGI AI Sales Trainer (`agi-ai-sales-trainer`)**: Aplikasi HP Android dengan kecerdasan buatan Google Gemini Live (Voice-to-Voice) yang berperan sebagai customer instansi pemerintah untuk latihan telemarketing.

**Kelemahan sistem lama:** Sales yang komunikasinya buruk di lapangan tidak tahu harus melatih skill apa, dan HR/SPV harus mengingatkan serta mengajari secara manual.

**Solusi Baru (Closed-Loop Coaching):** Menghubungkan kedua sistem menjadi satu siklus pembinaan otomatis tertutup:
- Kelemahan di lapangan terdeteksi $\rightarrow$ Modul latihan otomatis masuk ke HP sales $\rightarrow$ Sales berlatih suara dengan AI $\rightarrow$ Nilai kelulusan masuk kembali ke rapor HR.

```
                      [ PERCAKAPAN TELEPON LAPANGAN ]
                                     │
                                     ▼
                      [ AI EVALUATOR (SIRUP DASHBOARD) ]
                      Audit 10 Kompetensi Komunikasi Sales
                                     │
                                     ▼
                      [ TRAINING NEEDS ANALYSIS (TNA) ]
                      Rekomendasi Modul Prioritas L&D di /spv/reports
                                     │
                                     ▼ (Tombol HR: "⚡ Tugaskan ke HP Sales")
                      [ DATABASE PENUGASAN: trainer_assignments ]
                      Target Nilai: ≥ 80 · Batas Waktu: 7 Hari
                                     │
                                     ▼
                      [ APLIKASI ANDROID AGI TRAINER ]
                      Notifikasi & Banner Modul Pembinaan di HP Sales
                                     │
                                     ▼ (Voice-to-Voice Duplex)
                      [ ROLEPLAY SUARA NYATA DENGAN GEMINI LIVE ]
                      AI Menguji Skenario Penolakan Nyata di Lapangan
                                     │
                                     ▼ (Evaluation Engine)
                      [ PENILAIAN OTOMATIS & SERTIFIKASI ]
                      Skor ≥ 80 Lulus · Evidence-based Rubric
                                     │
                                     ▼
                      [ STATUS TERKIRIM BALIK KE RAPOR HR ]
                      Badge: "✅ Lulus Drill (Skor: 85/100)"
```

---

## 2. Pemetaan Kompetensi Komunikasi ke Modul AGI Trainer

Ketika HR menekan tombol **`Tugaskan ke HP Sales`** di halaman `/spv/reports`, sistem secara otomatis memetakan kompetensi yang bermasalah ke silabus modul AGI Trainer berikut:

| No | Kompetensi di Rapor Lapangan | Kode Modul | Nama Modul Latihan AGI Trainer | Fokus & Skenario Drill | Passing Grade |
|---|---|---|---|---|:---:|
| 1 | **Menutup & Langkah Lanjut (`next_step_closing`)** | `MOD-05` | Closing E-Purchasing & Handling Keberatan | Latihan mengunci tanggal demo / pengiriman penawaran harga (SPH) sebelum telepon ditutup. | $\ge 85$ |
| 2 | **Menangani Keberatan (`objection_handling`)** | `MOD-05` | Closing E-Purchasing & Handling Keberatan | Drill teknik *Acknowledge–Clarify–Respond* saat customer menolak harga atau memilih toko lokal. | $\ge 85$ |
| 3 | **Menggali Kebutuhan (`discovery`)** | `MOD-02` | Probing Spesifikasi Teknis & Kepatuhan TKDN | Latihan 3–5 pertanyaan terbuka menggali pagu anggaran & jadwal pemilihan sebelum presentasi spek. | $\ge 80$ |
| 4 | **Kualitas Bertanya (`questioning`)** | `MOD-02` | Probing Spesifikasi Teknis & Kepatuhan TKDN | Mengubah pertanyaan tertutup ("Bapak butuh toner?") menjadi pertanyaan terbuka yang mendalam. | $\ge 80$ |
| 5 | **Pengetahuan Produk (`product_knowledge`)** | `MOD-02` | Probing Spesifikasi Teknis & Kepatuhan TKDN | Drill spesifikasi toner, kompatibilitas cartridge, garansi resmi, dan sertifikat TKDN e-Katalog. | $\ge 80$ |
| 6 | **Menyampaikan Nilai (`value_proposition`)** | `MOD-02` | Probing Spesifikasi Teknis & Kepatuhan TKDN | Menghubungkan keunggulan layanan purnajual Orimax dengan kendala printer macet di dinas. | $\ge 80$ |
| 7 | **Membuka Percakapan (`opening`)** | `MOD-01` | First Pitch & Cold Calling PPK/PPTK | Membuka telepon salam + identitas nama + perusahaan + tujuan jelas dalam 30 detik pertama. | $\ge 80$ |
| 8 | **Komunikasi (`communication`)** | `MOD-01` | First Pitch & Cold Calling PPK/PPTK | Artikulasi jelas, tempo bicara tenang, tidak berbelit-belit, dan sopan kepada pejabat instansi. | $\ge 80$ |
| 9 | **Kedisiplinan Follow-Up (`follow_up_discipline`)** | `MOD-04` | Long-Cycle Nurturing & Re-engagement | Menghubungi kembali instansi tepat pada tanggal janji tindak lanjut tanpa terlewat. | $\ge 80$ |
| 10 | **Mendengarkan (`listening`)** | `MOD-03` | Gatekeeper Handling | Merangkum poin lawan bicara sebelum merespons; tidak memotong saat customer berbicara. | $\ge 80$ |

---

## 3. Panduan Penggunaan untuk HRD (Danar Susilo) & SPV / Manager

### Langkah 1: Membuka Halaman Rapor Perkembangan Skill
1. Login ke [https://sirup.orimax.co.id](https://sirup.orimax.co.id) menggunakan akun HR atau SPV.
2. Pada sidebar navigasi, pilih menu **`Rapor Perkembangan Skill`** (`/spv/reports`).
3. Pilih periode bulan yang ingin dievaluasi (misal: *Oktober 2026*).

### Langkah 2: Membaca Rangkuman TNA (Training Needs Analysis)
Di bagian atas layar, perhatikan 4 kartu metrik utama:
- **Sales Teranalisis:** Menunjukkan berapa banyak sales aktif yang komunikasinya sudah memiliki rekaman dan dianalisis AI.
- **Panggilan Dievaluasi:** Total panggilan telepon yang selesai diaudit.
- **Modul Prioritas L&D:** Berapa kompetensi yang mendesak untuk dilatihkan bulan ini.
- **Kekuatan Solid Tim:** Kompetensi yang sudah berstatus baik (Good) dan perlu dipertahankan.

### Langkah 3: Menugaskan Modul Pembinaan ke HP Sales
Pada kartu modul prioritas (misal: **Prioritas 1: Menutup & Langkah Lanjut**):
- **Opsi A (Massal):** Klik tombol **`⚡ Tugaskan ke HP Sales`** di pojok kanan kartu untuk menugaskan modul tersebut ke seluruh sales yang terdeteksi bermasalah sekaligus.
- **Opsi B (Perorangan):** Pada daftar nama sales di dalam kartu, klik tombol **`+Tugaskan`** di samping nama sales tertentu.
- Sistem akan menampilkan notifikasi hijau:  
  *`Berhasil menugaskan modul MOD-05 ke 4 sales. Tugas aktif di aplikasi AGI Trainer.`*

### Langkah 4: Memantau Progres Pengerjaan & Kelulusan
HR dan SPV dapat memantau badge status di samping nama sales:
- **`⏳ Tugas Terkirim`** *(Biru)*: Modul sudah masuk ke HP sales, batas waktu 7 hari.
- **`🔄 Sedang Latihan`** *(Sky)*: Sales sedang mengerjakan sesi roleplay di aplikasi HP.
- **`✅ Lulus Drill (Skor: 85)`** *(Hijau)*: Sales berhasil mencapai passing grade kelulusan.

---

## 4. Panduan untuk Sales Team (Peserta Latihan)

1. Buka aplikasi **AGI AI Sales Trainer** di smartphone Android.
2. Login menggunakan akun sales masing-masing.
3. Di halaman utama (*Dashboard*), akan muncul kartu penugasan dari HR:
   > *"Tugas Pembinaan Wajib dari HR: MOD-05 Closing E-Purchasing & Handling Keberatan (Target Nilai: ≥ 80 · Batas Waktu: 7 Hari)"*
4. Tekan tombol **`Mulai Latihan Suara`**.
5. Gunakan mikrofon HP untuk berbicara langsung dengan AI (Gemini Live). Bersikaplah profesional seolah-olah sedang berbicara dengan PPK atau Pejabat Pengadaan instansi pemerintah.
6. Selesaikan percakapan. AI Evaluation Engine akan langsung menampilkan skor evaluasi per kompetensi beserta bukti kalimat dan tips perbaikan.
7. Jika skor $\ge 80$, sistem otomatis mencatat Anda **Lulus Pembinaan** dan status di dashboard HR akan berubah hijau. Jika $< 80$, silakan ulangi roleplay hingga mencapai nilai standar.

---

## 5. Arsitektur Teknis & Integrasi Database

Kedua sistem berbagi satu database PostgreSQL produksi (`sirup`) di server `192.168.88.2`.

### A. Tabel Utama yang Terlibat
1. **`trainer_assignments`**:
   - Menyimpan tugas yang dikirim oleh HR dari SIRUP Dashboard.
   - Kolom kunci: `sales_id`, `module_id`, `skill`, `priority`, `target_score`, `due_date`, `status`, `external_ref` (`tna-{periode}-{skill}-{salesId}`).
2. **`trainer_modules`**:
   - Berisi katalog kurikulum (`MOD-01` s/d `MOD-05`), passing grade, dan kategori.
3. **`trainer_sessions`**:
   - Riwayat sesi percakapan audio yang dikerjakan sales di HP Android.
   - Kolom kunci: `sales_id`, `assignment_id`, `scenario_id`, `duration_seconds`, `status`.
4. **`trainer_evaluations`**:
   - Hasil skor evaluasi AI atas sesi latihan sales (`overall_score`, `feedback`, `strengths`, `weaknesses`).

### B. Endpoint API Terkait
- **`POST /api/coaching/training/assign`** (SIRUP Backend):
  Endpoint yang dipanggil oleh tombol frontend HR untuk membuat tugas di `trainer_assignments`.
- **`GET /api/trainer/assignments`** (AGI Trainer Backend Port 4100):
  Dipanggil oleh aplikasi Android untuk menampilkan daftar tugas wajib sales.
- **`GET /api/coaching/reports?month=YYYY-MM`** (SIRUP Backend):
  Mengembalikan data rekap TNA lengkap beserta status penugasan dan skor kelulusan terkini tiap sales.

---
*Dokumentasi ini dibuat dan disinkronkan secara resmi pada repositori GitHub PT. Aston Graphindo Indonesia.*
