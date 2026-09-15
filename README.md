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
| 2 | Backend skeleton | 🔄 |
| 3 | Seed kurikulum | ⬜ |
| 4 | Prompt manager | ⬜ |
| 5 | AI Roleplay Engine | ⬜ |
| 6 | STT + TTS | ⬜ |
| 7 | Evaluation Engine | ⬜ |
| 8 | Progress / Retry / History | ⬜ |
| 9 | Aplikasi Android | ⬜ |
| 10 | Admin management | ⬜ |
| 11 | Integrasi Sales Analytics | ⬜ |
| 12 | Hardening | ⬜ |

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
- JDK 17 · Android SDK (cmdline-tools, platform-tools, platforms;android-34, build-tools;34.0.0)

```bash
export ANDROID_HOME="$HOME/Android/Sdk"
export PATH="$ANDROID_HOME/cmdline-tools/latest/bin:$ANDROID_HOME/platform-tools:$PATH"
```

### Database
Migrasi bersifat idempotent dan hanya menambah tabel berprefiks `trainer_*`
(tidak menyentuh tabel Sales Analytics).

```bash
docker exec -i orimax-sirup-postgres-1 psql -U orimax -d sirup \
  -v ON_ERROR_STOP=1 < backend/migrations/001_trainer_schema.sql
```

### Backend
```bash
cd backend && npm install && npm run dev
```

## Layout

```
backend/
  migrations/   001_trainer_schema.sql   (idempotent, additive)
  src/
android/
docs/           ARCHITECTURE_PROPOSAL.md
```

## Aturan penting

- **Immutability** — `trainer_evaluations` menyimpan `prompt_version_id` + `ai_model`.
  Mengedit prompt/rubric/modul membuat **versi baru**; skor historis tidak pernah berubah.
- **Guardrail evaluasi** — setiap skor kompetensi wajib punya `evidence`. Output LLM
  divalidasi schema; JSON invalid ditolak & di-retry, tidak pernah disimpan.
- **Fakta produk** — LLM hanya boleh mengambil fakta dari `trainer_product_knowledge`.
- **Idempotency callback** — `trainer_result_outbox` UNIQUE per `session_id`.
