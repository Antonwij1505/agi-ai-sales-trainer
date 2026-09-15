# AGI AI Sales Trainer

Platform training sales berbasis AI untuk PT. Aston Graphindo Indonesia / ORIMAX.
Sales berlatih telemarketing dengan AI yang berperan sebagai customer instansi
pemerintah Indonesia — suara penuh (bukan tombol), lalu dievaluasi otomatis
berdasarkan rubric training.

PRD: v1.0 · Arsitektur: [`docs/ARCHITECTURE_PROPOSAL.md`](docs/ARCHITECTURE_PROPOSAL.md)

[![CI](https://github.com/Antonwij1505/agi-ai-sales-trainer/actions/workflows/ci.yml/badge.svg)](https://github.com/Antonwij1505/agi-ai-sales-trainer/actions/workflows/ci.yml)

---

## Status

| Stage | Deliverable | Status |
|---|---|---|
| 0 | Dokumen arsitektur | ✅ disetujui |
| 1 | Migrasi DB `trainer_*` | ✅ 14 tabel, verified |
| 2 | Backend skeleton | ✅ jalan di :4100 |
| 3 | Seed kurikulum MVP | ✅ MOD-03, 5 skenario |
| 4 | Prompt manager | ✅ versioned + cache |
| 5 | AI Roleplay Engine | ✅ 1.6–2.8s/turn, in-character |
| 6 | STT + TTS | ✅ round-trip audio Indonesia |
| 7 | Evaluation Engine | ✅ guardrail + skor deterministik |
| 8 | Progress / Retry / History | ✅ rollup + cap percobaan |
| 9 | Aplikasi Android | ✅ UI lengkap, APK 19 MB build lolos |
| 10 | Admin management | ✅ CRUD + versioning dipaksa |
| 11 | Integrasi Sales Analytics | ✅ idempotent 2 arah + worker outbox |
| 12 | Hardening | ✅ rate limit + audit secret |

**Semua 13 stage (0–12) selesai.**

## Verifikasi di emulator (bukan sekadar kompilasi)

APK dijalankan di emulator Android 14 (x86_64, headless) dan alurnya didorong
lewat `adb input`, dengan hasil dibaca dari screenshot + log akses server.

| Yang diuji | Hasil |
|---|---|
| Install + launch | jalan, tidak crash (`pidof` hidup) |
| Login form ter-render | ya — judul, Username, Password, Masuk |
| Login dengan kredensial nyata (`admin` / `admin123`) | **berhasil** → "Halo, Administrator" |
| Dashboard memuat katalog | ya — kartu MOD-03 dengan "5 skenario · lulus ≥ 80 · maks 3x" |
| Buka detail modul | ya — 5 skenario + persona + tombol "Mulai Latihan Suara" |
| Dialog izin mikrofon | muncul, alur permission benar |
| Mulai sesi suara | ya — `POST /sessions`, opening line dari backend, resistensi 3/5 |
| Perekaman + VAD | masuk mode "Mendengarkan…", nudge "Customer menunggu…" muncul, tanpa crash |
| Tombol Batal | kembali ke IDLE, tanpa crash |
| Kontrak data evaluasi | semua field yang dibaca Kotlin ada di respons nyata (skor 44/100, 5 kompetensi) |
| Kebocoran request | **0** request saat idle |
| **Layar Hasil** | ✅ ter-render lewat instrumented Compose test — 6/6 lolos, screenshot di `docs/screenshots/result_screen.png` |

**Catatan layar Hasil.** Layar ini hanya muncul setelah percakapan suara selesai,
dan menyelesaikan percakapan butuh input mikrofon nyata — yang **tidak bisa**
diberikan ke emulator di host ini: emulator 37.1.11 sudah membuang backend ALSA
(hanya `pa`/`sdl`/`oss`/`none`), `sdl` tidak mendukung input, dan `pa` gagal init
meski `PULSE_SERVER` sudah diarahkan ke daemon milik user. Jadi layar dipecah
menjadi komponen stateless `ResultContent` dan dirender lewat instrumented test
dengan data nyata dari API. Detail di [`docs/EMULATOR_TESTING.md`](docs/EMULATOR_TESTING.md).

Loopback mikrofon virtual di sisi host **sudah terbukti bekerja** (capture
-18.8 dB, ditranskrip benar oleh whisper) — yang gagal hanya sisi emulatornya.

## Batasan yang jujur

1. **Layar Hasil ter-render, tapi lewat test — bukan alur UI.** Komponennya sudah
   terbukti render dengan data nyata (`ResultScreenTest`, 6/6 lolos di emulator
   lokal *dan* di runner GitHub), tapi belum pernah dicapai dengan menyelesaikan
   percakapan suara sungguhan, karena emulator tidak bisa diberi input mikrofon.
   Lihat [`docs/EMULATOR_TESTING.md`](docs/EMULATOR_TESTING.md).
2. **Belum ada test otomatis untuk endpoint HTTP.** 21 test yang ada menguji logika
   deterministik tanpa LLM. CI menguji beberapa endpoint lewat stack Compose
   (health, whoami, buat sesi), tapi belum ada suite HTTP yang menyeluruh.
3. **Belum diuji di perangkat fisik.** Mikrofon nyata, kebisingan ruangan, dan
   latensi jaringan seluler belum pernah dicoba. Ini gap terbesar yang tersisa.

## Arsitektur singkat

```
Android (Kotlin/Compose)  ──HTTPS──▶  Trainer Backend (:4100)  ──▶  Postgres (schema trainer_*)
   tanpa secret                          STT Groq whisper (id)
                                         LLM 9router / DeepSeek
                                         TTS edge-tts (id-ID)
                                              │
                                    worker outbox (:4100 terpisah)
                                              ▼
                                    Sales Analytics callback
```

Android **tidak pernah** menyimpan API key — semua provider diproksikan backend
(PRD §8, §78). Kredensial hidup di tabel `filter_config` milik Sales Analytics.

## Setup

### Cara tercepat: Docker Compose (stack mandiri)

Satu perintah, tanpa menyentuh Postgres Sales Analytics:

```bash
docker compose up --build
curl localhost:4100/health/ready      # → {"status":"ready","trainer_tables":14}
docker compose down -v                # -v sekaligus hapus data demo
```

Yang dijalankan: `postgres` (port host **5433**, bukan 5432 — 5432 sudah dipakai
analytics), `api` (:4100, menjalankan migrasi sebelum listen), dan `worker`
(outbox poller).

**Kenapa ada `docker/initdb/000_analytics_base.sql`.** Empat tabel trainer punya
`sales_id BIGINT REFERENCES users(id)`. Di produksi tabel `users` sudah ada karena
schema dibagi dengan Sales Analytics; stack mandiri tidak punya, sehingga migrasi
akan gagal dengan `relation "users" does not exist`. File itu membuat **hanya**
subset yang dibutuhkan trainer (`users` + `filter_config`), plus dua akun demo:

| username | password | role |
|---|---|---|
| `admin` | `admin123` | admin |
| `sales` | `sales123` | sales |

Kredensial itu **hanya untuk database lokal sekali pakai**. Jangan dipakai di produksi.

### Manual (menempel ke Postgres Sales Analytics yang sudah ada)

#### Prasyarat
- Node 20+ · Python 3.12 · Docker · ffmpeg
- JDK 17 · Android SDK 35 · Gradle 8.11.1
- `edge-tts` CLI (TTS gratis, tanpa API key)

```bash
export ANDROID_HOME="$HOME/Android/Sdk"
export PATH="$ANDROID_HOME/cmdline-tools/latest/bin:$ANDROID_HOME/platform-tools:/opt/gradle/gradle-8.11.1/bin:$PATH"
```

#### Database
Migrasi idempotent dan hanya menambah tabel berprefiks `trainer_*`
(tidak menyentuh tabel Sales Analytics).

```bash
for f in backend/migrations/*.sql; do
  docker exec -i orimax-sirup-postgres-1 psql -U orimax -d sirup -v ON_ERROR_STOP=1 < "$f"
done
```

#### Backend
```bash
cd backend
cp .env.example .env      # isi JWT_SECRET yang SAMA dengan Sales Analytics
npm install
npm run dev               # API   → http://localhost:4100
npm run worker            # outbox → kirim hasil ke Sales Analytics
```

#### Android
```bash
cd android
./gradlew assembleDebug
# → app/build/outputs/apk/debug/app-debug.apk
```

## Test

```bash
# Backend — 21 test deterministik, tanpa LLM & tanpa DB
cd backend && npx tsx src/tests/guardrails.test.ts

# Android — render layar Hasil di emulator (6 test)
cd android && ./gradlew connectedDebugAndroidTest

# Audit keamanan (rahasia di git + di APK)
bash backend/scripts/security-audit.sh
```

CI (`.github/workflows/ci.yml`) menjalankan ketiganya plus boot stack Compose.

## Endpoint

| Method | Path | Auth | Keterangan |
|---|---|---|---|
| GET | `/health` | — | liveness |
| GET | `/health/ready` | — | cek schema `trainer_*` |
| GET | `/health/whoami` | JWT | echo identitas |
| GET | `/api/trainer/modules` | JWT | daftar modul |
| GET | `/api/trainer/modules/:id` | JWT | modul + skenario + rubric |
| POST | `/api/trainer/sessions` | JWT | mulai sesi |
| GET | `/api/trainer/sessions/:id` | JWT | sesi + transkrip + evaluasi |
| POST | `/api/trainer/sessions/:id/turn` | JWT | turn teks |
| POST | `/api/trainer/sessions/:id/voice` | JWT | **audio in → STT → LLM → TTS → audio out** |
| POST | `/api/trainer/sessions/:id/finish` | JWT | tutup sesi |
| POST | `/api/trainer/sessions/:id/evaluate` | JWT | evaluasi (idempotent) |
| GET | `/api/trainer/sessions/:id/evaluation` | JWT | baca evaluasi |
| GET | `/api/trainer/progress` | JWT | progres per modul |
| GET | `/api/trainer/history` | JWT | riwayat percobaan |
| GET | `/api/trainer/progress/:moduleId/compare` | JWT | perbandingan attempt |
| POST | `/api/trainer/scenarios/:id/retry` | JWT | ulangi (dibatasi `max_attempt`) |
| POST | `/api/trainer/integrations/assignments` | API key / admin | assignment masuk (idempotent) |
| GET | `/api/trainer/assignments` | JWT | assignment saya |
| POST | `/api/trainer/integrations/outbox/flush` | admin | kirim hasil sekarang |
| POST | `/api/trainer/admin/modules` | admin | buat modul / versi baru |
| POST | `/api/trainer/admin/rubrics` | admin | publikasi rubric (Σ=100) |
| POST | `/api/trainer/admin/prompts` | admin | publikasi prompt versi baru |

## Test & audit

```bash
cd backend
npx tsx src/tests/guardrails.test.ts          # 21 test, tanpa LLM
bash scripts/security-audit.sh                # audit secret + APK
```

`security-audit.sh` memverifikasi: `.env` tidak terlacak git, tidak ada pola
kredensial di source, APK tidak memuat API key maupun host provider, dan
`JWT_SECRET` cukup panjang.

## Aturan penting

- **Immutability** — `trainer_evaluations` menyimpan `prompt_version_id` + `ai_model`.
  Mengedit prompt/rubric/modul membuat **versi baru**; skor historis tidak berubah.
  API menolak overwrite diam-diam: `new_version=true` wajib untuk versi baru.
- **Guardrail evaluasi** — setiap skor kompetensi wajib punya `evidence`. Total
  berbobot dihitung ulang **di server** dari rubric tersimpan, jadi aritmatika
  model tidak pernah dipercaya.
- **Fakta produk** — LLM hanya boleh mengambil fakta dari `trainer_product_knowledge`.
- **State percakapan dipegang server** — resistensi/stage/done dihitung
  deterministik di kode, bukan diminta dari model (kebal prompt injection).
- **Idempotency** — callback hasil UNIQUE per `session_id`; assignment masuk
  UNIQUE per `external_ref`.
- **Tanpa secret di APK** — diverifikasi otomatis oleh `security-audit.sh`.

## Keputusan desain yang diambil dari pengukuran

**Model tidak diminta mengeluarkan JSON.** Prompt v1 meminta envelope
`{"reply":..., "resistance":...}`. Diuji ke provider terpasang: model tidak patuh
dan keluar dari peran (`cbai/kimi-k2.6` menjawab `## Analisis Opening`,
`cbai/minimax-m3` menawarkan membuat draft skrip). Karena itu server yang memegang
state. Prompt v1 tidak diedit; v2 dibuat dan v1 dinonaktifkan (migrasi `003`).

**Model default diganti.** `orimax_fast` terukur 34–60s dan mengembalikan
**konten kosong** (reasoning token menghabiskan budget). Dipakai
`cbai/deepseek-v4.1-flash` (~2s) lewat key `trainer_ai_model` — key analytics
`ai_model` tidak diubah.
