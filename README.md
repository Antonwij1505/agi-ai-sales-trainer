# AGI AI Sales Trainer

Platform training sales berbasis AI untuk PT. Aston Graphindo Indonesia / ORIMAX.
Sales berlatih telemarketing dengan AI yang berperan sebagai customer instansi
pemerintah Indonesia — suara penuh (bukan tombol), lalu dievaluasi otomatis
berdasarkan rubric training.

PRD: v1.0 · Arsitektur: [`docs/ARCHITECTURE_PROPOSAL.md`](docs/ARCHITECTURE_PROPOSAL.md)

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

## Batasan yang jujur

Yang **belum** diverifikasi:

1. **UI Android belum pernah dijalankan di perangkat/emulator.** Host ini tidak
   punya KVM, jadi emulator tidak bisa dipakai. Kompilasi APK dan kontrak API
   sudah diverifikasi, tapi perilaku sentuh, perekaman mikrofon nyata, dan
   playback audio belum pernah diuji di Android. Ini risiko terbuka R1.
2. **Belum ada test otomatis untuk endpoint HTTP.** 21 test yang ada menguji
   logika deterministik (aritmatika skor, batas resistensi, sanitasi output,
   ekstraksi JSON, rendering prompt) tanpa memanggil LLM. Alur endpoint diuji
   manual dengan data nyata, bukan dengan suite otomatis.
3. **Belum ada CI.** Tidak ada GitHub Actions; semua verifikasi dijalankan manual.
4. **Belum ada Docker Compose untuk service trainer.** Dockerfile ada, tapi
   orkestrasi (postgres + api + worker) belum ditulis.

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

### Prasyarat
- Node 20+ · Python 3.12 · Docker · ffmpeg
- JDK 17 · Android SDK 35 · Gradle 8.11.1
- `edge-tts` CLI (TTS gratis, tanpa API key)

```bash
export ANDROID_HOME="$HOME/Android/Sdk"
export PATH="$ANDROID_HOME/cmdline-tools/latest/bin:$ANDROID_HOME/platform-tools:/opt/gradle/gradle-8.11.1/bin:$PATH"
```

### Database
Migrasi idempotent dan hanya menambah tabel berprefiks `trainer_*`
(tidak menyentuh tabel Sales Analytics).

```bash
for f in backend/migrations/*.sql; do
  docker exec -i orimax-sirup-postgres-1 psql -U orimax -d sirup -v ON_ERROR_STOP=1 < "$f"
done
```

### Backend
```bash
cd backend
cp .env.example .env      # isi JWT_SECRET yang SAMA dengan Sales Analytics
npm install
npm run dev               # API   → http://localhost:4100
npm run worker            # outbox → kirim hasil ke Sales Analytics
```

### Android
```bash
cd android
gradle assembleDebug
# → app/build/outputs/apk/debug/app-debug.apk
```

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
