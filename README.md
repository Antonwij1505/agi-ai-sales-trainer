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
| 8 | Progress / Retry / History | ⬜ |
| 9 | Aplikasi Android | 🟡 skeleton + APK build lolos |
| 10 | Admin management | ⬜ |
| 11 | Integrasi Sales Analytics | ⬜ |
| 12 | Hardening | ⬜ |

**Progress: 8 dari 13 unit (Stage 0–7) ≈ 62%.**
Backend inti sudah berfungsi end-to-end lewat API. UI Android masih placeholder.

## Keputusan desain yang diambil dari pengukuran, bukan preferensi

**Model tidak diminta mengeluarkan JSON.** Prompt v1 meminta envelope
`{"reply":..., "resistance":...}`. Diuji ke provider yang terpasang: model tidak
patuh dan keluar dari peran (`cbai/kimi-k2.6` menjawab `## Analisis Opening`,
`cbai/minimax-m3` menawarkan membuat draft skrip). Karena itu **server** yang
memegang state percakapan (`roleplay.service.ts`) — deterministik, bisa diuji
tanpa LLM, dan kebal prompt injection. Prompt v1 tidak diedit; v2 dibuat dan v1
dinonaktifkan (migrasi `003`).

**Model default diganti.** `orimax_fast` terukur 34–60s dan mengembalikan
**konten kosong** (reasoning token menghabiskan budget). Trainer butuh 1–3s, jadi
dipakai `cbai/deepseek-v4.1-flash` (~2s) lewat key `trainer_ai_model` — key
analytics `ai_model` tidak diubah.


## Arsitektur singkat

```
Android (Kotlin/Compose)  ──HTTPS──▶  Trainer Backend (:4100)  ──▶  Postgres (schema trainer_*)
   tanpa secret                          STT Groq whisper (id)
                                         LLM 9router / DeepSeek
                                         TTS edge-tts (id-ID)
```

Android **tidak pernah** menyimpan API key — semua provider diproksikan backend
(PRD §8, §78). Kredensial hidup di tabel `filter_config` milik Sales Analytics,
dibaca lewat pola `credentials.ts` yang sama.

## Setup

### Prasyarat
- Node 20+ · Python 3.12 · Docker
- JDK 17 · Android SDK 35 · Gradle 8.11.1

```bash
export ANDROID_HOME="$HOME/Android/Sdk"
export PATH="$ANDROID_HOME/cmdline-tools/latest/bin:$ANDROID_HOME/platform-tools:/opt/gradle/gradle-8.11.1/bin:$PATH"
```

### Database
Migrasi idempotent dan hanya menambah tabel berprefiks `trainer_*`
(tidak menyentuh tabel Sales Analytics).

```bash
docker exec -i orimax-sirup-postgres-1 psql -U orimax -d sirup \
  -v ON_ERROR_STOP=1 < backend/migrations/001_trainer_schema.sql
docker exec -i orimax-sirup-postgres-1 psql -U orimax -d sirup \
  -v ON_ERROR_STOP=1 < backend/migrations/002_seed_mvp.sql
```

### Backend
```bash
cd backend
cp .env.example .env      # isi JWT_SECRET yang SAMA dengan Sales Analytics
npm install
npm run dev               # → http://localhost:4100
```

Cek:
```bash
curl localhost:4100/health          # {"status":"ok",...}
curl localhost:4100/health/ready    # {"status":"ready","trainer_tables":14}
```

### Android
```bash
cd android
gradle assembleDebug
# → app/build/outputs/apk/debug/app-debug.apk
```

## Layout

```
backend/
  migrations/   001_trainer_schema.sql   (14 tabel, additive + idempotent)
                002_seed_mvp.sql         (MOD-03 + 5 skenario + rubric)
  src/
    config/env.ts               validasi env, gagal cepat
    db/pool.ts                  pg pool + handler koneksi mati
    db/migrate.ts               runner migrasi idempotent
    middleware/                 JWT (kontrak sama dgn Sales Analytics) + error
    routes/                     health, catalog
android/
  app/src/main/java/com/astongraphindo/agitrainer/
docs/           ARCHITECTURE_PROPOSAL.md
```

## Endpoint saat ini

| Method | Path | Auth | Keterangan |
|---|---|---|---|
| GET | `/health` | — | liveness |
| GET | `/health/ready` | — | cek schema `trainer_*` ada |
| GET | `/health/whoami` | JWT | echo identitas |
| GET | `/api/trainer/modules` | JWT | daftar modul + jumlah skenario |
| GET | `/api/trainer/modules/:id` | JWT | detail modul + skenario + rubric |
| POST | `/api/trainer/sessions` | JWT | mulai sesi, balas opening line CS |
| GET | `/api/trainer/sessions/:id` | JWT | sesi + transkrip + evaluasi |
| POST | `/api/trainer/sessions/:id/turn` | JWT | turn teks → balasan CS |
| POST | `/api/trainer/sessions/:id/voice` | JWT | **audio in → STT → LLM → TTS → audio out** |
| POST | `/api/trainer/sessions/:id/finish` | JWT | tutup sesi |
| POST | `/api/trainer/sessions/:id/evaluate` | JWT | jalankan evaluasi (idempotent) |
| GET | `/api/trainer/sessions/:id/evaluation` | JWT | baca evaluasi tersimpan |

## Test

```bash
cd backend && npx tsx src/tests/guardrails.test.ts   # 21 test, tanpa LLM
```

Menguji aritmatika skor (bobot rubric tidak bisa di-inflate model), batas
resistensi 1..5, sanitasi output model, ekstraksi JSON, dan rendering prompt.


## Aturan penting

- **Immutability** — `trainer_evaluations` menyimpan `prompt_version_id` + `ai_model`.
  Mengedit prompt/rubric/modul membuat **versi baru**; skor historis tidak pernah berubah.
- **Guardrail evaluasi** — setiap skor kompetensi wajib punya `evidence`. Output LLM
  divalidasi schema; JSON invalid ditolak & di-retry, tidak pernah disimpan.
- **Fakta produk** — LLM hanya boleh mengambil fakta dari `trainer_product_knowledge`.
  Jika tidak ada, jawab "tidak tahu" — jangan mengarang.
- **Idempotency callback** — `trainer_result_outbox` UNIQUE per `session_id`.
- **Tanpa secret di APK** — diverifikasi dengan strings scan pada APK hasil build.

## Verifikasi yang sudah dijalankan

- Migrasi `001` apply bersih + **re-run tanpa error** (idempotent).
- Constraint diuji: speaker selain `AI|SALES` ditolak; weight 0 dan >100 ditolak.
- FK `trainer_*` → `users` existing terbentuk (4 tabel).
- Seed `002` re-run → tetap 5 skenario (tidak duplikat); Σ weight rubric = 100.
- Kontrak JWT bersama: token dari secret Sales Analytics diterima backend trainer.
- APK debug 17 MB build sukses, ter-sign, dan **tidak mengandung API key**
  maupun host provider (`9router`, `groq`, `deepseek`, `openai`).
