# AGI AI Sales Trainer — Architecture Proposal (STEP 2 / STEP 3)

> Derived from PRD v1.0 (§1–§100). Status: **DRAFT — awaiting sign-off before coding.**
> Author: Hermes · Date: 2026-09-15

---

## 1. Repository & Environment Inspection (PRD §92 STEP 1)

### 1.1 Host environment

| Item | Finding |
|---|---|
| OS | Ubuntu 24.04 (kernel 6.8), x86_64 |
| Node | v22.23.1 · npm 12 |
| Python | 3.12.3 |
| Docker | 29.7.2 (compose v2) — **actively used** |
| Disk | 466 GB total, **65 GB free (86% used)** |
| Java / Gradle / Android SDK | **NOT INSTALLED** |
| Network | dl.google.com, repo1.maven.org, services.gradle.org all reachable (HTTP 200) |

### 1.2 Existing project identified: `~/orimax-sirup-dashboard` = **the "Sales Analytics" project** of PRD §4

```
orimax-sirup-dashboard/
├── backend/    Node 24 + Express 5 + TypeScript (ESM) + PostgreSQL 16  → :4000
├── frontend/   Next.js 15 App Router + Tailwind + Recharts            → :3004
├── scraper/    Python (RUP/LPSE) — OUT OF SCOPE for us
└── docker-compose.yml  (postgres, backend, backend-worker, frontend, scraper)
```
**Live right now:** postgres (healthy), backend, backend-worker, frontend.

### 1.3 Reusable infrastructure discovered (PRD §100.2 — must reuse, not rebuild)

| Capability | Where it lives | Reuse for AI Trainer |
|---|---|---|
| Auth (JWT, 30d) | `auth.routes.ts`, `auth.middleware.ts` | ✅ same JWT contract |
| Roles | `users.role` CHECK: `admin · sales · spv · manager`; **14 sales, 2 spv, 1 manager, 1 admin seeded** | ✅ `sales` = Role 1, `admin` = Role 2 |
| RBAC pattern | `requireAuth`, `requireAdmin`, sales-scoped queries | ✅ copy pattern |
| **Credential store** | `filter_config` table, admin-editable, env fallback, 30s cache — `config/credentials.ts` | ✅ **all AI keys live here, never in APK** (PRD §78) |
| LLM access | 9router OpenAI-compatible `https://9router.orimax.co.id/v1` — **110 models** incl. `orimax_fast`, `orimax_pro`, `cbai/deepseek-v4-flash`, `gemini-3.x`, `kr/claude-sonnet-4.5` | ✅ Conversation + Evaluation LLM |
| LLM client pattern | `ai-extraction.service.ts` (JSON extraction, coercion, streaming fallback, timeout) | ✅ mirror it |
| STT | Groq OpenAI-compatible `/audio/transcriptions`, `whisper-large-v3`, `language=id` | ✅ **Indonesian STT already working** |
| Audio preprocess | `audio-preprocess.service.ts` (AMR/3GP→WAV via ffmpeg) | ✅ reuse |
| Object storage | `storage/` dir + `resolveAudioFile()` traversal guard | ✅ audio references |
| Async queue | `recording_processing_jobs` (SKIP LOCKED, retry/backoff, stale recovery) | ✅ pattern for eval jobs |
| Migrations | plain versioned SQL in `backend/migrations/`, applied at startup, idempotent | ✅ same convention |
| Provider abstraction | `getAiConfig()/getSttConfig()` + `provider` field | ✅ extend to TTS |

### 1.4 Gaps found

| Gap | Impact | Resolution |
|---|---|---|
| **No TTS anywhere** (9router & Groq expose **no** TTS models) | AI cannot speak (PRD §15.9) | Verified working fix: **edge-tts** → `id-ID-ArdiNeural` (male) / `id-ID-GadisNeural` (female), free, no key. Behind `TextToSpeechProvider` abstraction. |
| **No Android toolchain** | P0 = Android app (PRD §99) | JDK 17 + Android cmdline-tools + SDK + Gradle installable (disk/network OK). Emulator not assumed. |
| No `schema_migrations` tracking | migration drift risk | keep idempotent-SQL convention (as-is) |

---

## 2. Architecture Proposal (PRD §4, §79, §98)

### 2.1 Deployment topology

```
                    ┌──────────────────────────────────────────┐
   Android App      │  AGI AI TRAINER BACKEND (new service)    │
  (Kotlin/Compose)  │  Node 24 + Express 5 + TypeScript        │
        │           │  /api/trainer/*        :4100             │
        │  HTTPS    │                                          │
        └──────────▶│  ┌────────────────────────────────────┐  │
                    │  │ Auth (reuse JWT contract)          │  │
                    │  │ Training Service (modules/scenarios)│  │
                    │  │ AI Service                          │  │
                    │  │   Conversation Manager              │  │
                    │  │   Persona Engine                    │  │
                    │  │   Scenario Engine                   │  │
                    │  │   Response Generator  ──▶ LLM      │  │
                    │  │   Evaluation Engine   ──▶ LLM      │  │
                    │  │   Prompt Manager (versioned)        │  │
                    │  │ Provider Abstraction:               │  │
                    │  │   STT ─▶ Groq whisper (id)          │  │
                    │  │   TTS ─▶ edge-tts (id-ID)           │  │
                    │  │   LLM ─▶ 9router / DeepSeek         │  │
                    │  └────────────────────────────────────┘  │
                    └───────────────┬──────────────────────────┘
                                    │ Postgres schema: trainer_*
                                    ▼
                    ┌───────────────────────────────┐
                    │ postgres (shared instance)     │
                    └───────────────────────────────┘
                                    ▲
   SALES ANALYTICS (orimax-sirup-dashboard)
   POST /api/training/assignments  ─────┘   (inbound training need)
   ◀── POST /api/training/results (callback, idempotent)
```

### 2.2 Why this shape

- **Own service, shared Postgres + shared AI credentials** — the AI Trainer has a distinct domain (roleplay sessions, transcripts, rubrics) that must not pollute the analytics schema. But it must *not* duplicate auth, credential management, STT, or provider plumbing.
- **Node/TS + Express 5** matches the existing backend exactly → same conventions, same `credentials.ts`, same migration runner, same Docker pattern. No new stack (PRD §100.3).
- **Android holds zero secrets** (PRD §8, §78): it only ever talks to our backend.

### 2.3 Integration contract (PRD §80–§83)

- **Inbound:** `POST /api/training/assignments` — `{sales_id, module_id, skill, priority, target_score, context{product_category, institution_type, rup_context?}}` → creates `trainer_assignments` row.
- **Outbound:** `POST /api/training/results` (callback to Sales Analytics) with `session_id` as **idempotency key** (PRD §82).
- **Auth:** shared JWT + `X-API-KEY` for system-to-system (pattern already exists: `comm_log_api_key`).

---

## 3. Data Model (PRD §50–§60) — all tables namespaced `trainer_*`

```
users                (EXISTING — reused; add nothing)
trainer_modules      id, code, name, description, category, difficulty,
                     passing_score, max_attempt, status(DRAFT..ACTIVE),
                     active, version, created_at, updated_at
trainer_scenarios    id, module_id, name, description, persona_id, difficulty,
                     resistance_level, product_category, institution_type,
                     objective, success_criteria, failure_criteria,
                     rup_context_required, status, active, version, timestamps
trainer_personas     id, name, type, role, attitude, communication_style,
                     knowledge_level, interest_level, urgency, existing_vendor,
                     budget_condition, default_resistance, active
trainer_rubrics      id, module_id, name, weight, criteria, scoring_instruction,
                     active, version            (weighted; Σ=100 per module)
trainer_assignments  id, sales_id→users, module_id, skill, priority, target_score,
                     context jsonb, status, due_date, max_attempt, source,
                     external_ref, timestamps
trainer_sessions     id, assignment_id, sales_id, scenario_id, attempt, mode,
                     started_at, ended_at, duration_seconds, status,
                     audio_ref, transcript_ref, used_hint, eval_status
trainer_turns        id, session_id, turn_id, speaker(AI|SALES), text, timestamp,
                     audio_ref, sequence_number
trainer_evaluations  id, session_id UNIQUE, overall_score, status, feedback jsonb,
                     strengths[], weaknesses[], critical_errors[],
                     recommendation, confidence, ai_model, prompt_version_id,
                     created_at          ← IMMUTABLE (PRD §60, §67)
trainer_competency_scores  id, evaluation_id, competency, score, weight, evidence
trainer_progress     id, sales_id, module_id, first_score, latest_score,
                     highest_score, avg_score, attempts, improvement, pass_status
trainer_product_knowledge  id, category, name, payload jsonb, version, status,
                     active, timestamps
trainer_prompts      id, key(system|persona|scenario|business|rules|evaluation),
                     version, content, active, created_at   ← versioned
trainer_certifications  id, sales_id, level, status, score, awarded_at  (P2)
trainer_result_outbox   id, session_id UNIQUE, payload jsonb, delivered_at,
                     attempts   ← guarantees idempotent callback (§82)
```

**Immutability rule (PRD §60/§67):** `trainer_evaluations` and `trainer_competency_scores` store the
`prompt_version_id` + `ai_model` used. Rubrics/prompts/modules are versioned; editing them creates a
new version — historical rows never mutate.

---

## 4. AI Pipeline (PRD §62)

### 4.1 Roleplay turn (latency target 1–3 s, §77)
```
Android mic ──audio──▶ POST /api/trainer/sessions/:id/turn
                          │
                          ├─ 1. STT        Groq whisper-large-v3 (id)      ~0.5–1.5s
                          ├─ 2. persist    trainer_turns (SALES)
                          ├─ 3. LLM        Conversation Manager:
                          │                system+persona+scenario+history+rules
                          │                → {reply, state, resistance_delta, ...} ~1–2s
                          ├─ 4. persist    trainer_turns (AI)
                          └─ 5. TTS        edge-tts id-ID → mp3 in storage
                       ◀── {ai_text, ai_audio_url, state, ...}
```
- **Barge-in (§21):** streaming endpoint + `POST /sessions/:id/interrupt` → cancels in-flight TTS.
- **Silence (§22):** Android VAD detects 5 s silence → `POST /sessions/:id/silence` → AI nudge line.
- **Never button-based (§15):** free speech only.

### 4.2 Evaluation (§33–§38, §63–§64)
```
full transcript + turns + rubric(version) + persona + objective
        ▼
Evaluation Prompt (versioned) ──▶ LLM (reasoning model, e.g. orimax_pro)
        ▼
structured JSON ──▶ validate (zod) ──▶ coerce/clamp ──▶ persist (immutable)
```
Guardrails enforced in code, not just prompt: score-per-competency **must** carry `evidence`
string; customer rejection must not auto-fail sales behavior; keyword matching alone is
insufficient; output rejected & retried if schema invalid.

---

## 5. Android App (PRD §8, §11–§14, §39–§49)

```
com.astongraphindo.agitrainer/
├── presentation/   Compose screens: Login, Dashboard, Assignments, Brief,
│                   LiveSession (voice), Result, Feedback, History, Progress, Exam
├── domain/         models + use cases + repository interfaces
├── data/           repository impls, DTOs
├── network/        Retrofit/OkHttp, JWT interceptor, token store (EncryptedSharedPrefs)
├── ai/             NO provider secrets — backend proxies everything
├── audio/          AudioRecord capture, VAD, silence detection, playback w/ barge-in
└── storage/        Room (offline cache), DataStore
```
Stack per PRD §8: Kotlin · Compose · MVVM · Clean Architecture · Repository · Hilt · Coroutines.

---

## 6. Implementation Plan (PRD §92, staged; test→fix→retest between stages)

| # | Stage | Deliverable | Gate |
|---|---|---|---|
| 0 | **This doc** | architecture + risks signed off | ✅ you approve |
| 1 | DB schema | `trainer_*` migrations 040–04x | migration applies clean on live PG |
| 2 | Backend skeleton | Express service, health, JWT, RBAC, Docker service | `/health` + `/api/auth/me` green |
| 3 | Curriculum seed | Module 03 Gatekeeper + 5 MVP scenarios + Government CS persona + rubric | rows queryable |
| 4 | Prompt manager | versioned prompts table + loader | unit test: version pinning |
| 5 | **AI Roleplay Engine** | Conversation Manager + Persona Engine + resistance + state | multi-turn mock test |
| 6 | STT + TTS | turn endpoint end-to-end (audio in → audio out) | real Indonesian audio round-trip |
| 7 | Evaluation Engine | rubric scoring + evidence + JSON validation + critical errors | fixture transcripts → expected ranges |
| 8 | Progress/Retry/History | attempt comparison, improvement, progress table | unit tests |
| 9 | Android app | full P0 flow against stage 6–8 API | builds + manual run |
| 10 | Admin mgmt | module/scenario/persona/rubric CRUD + content workflow | RBAC tests |
| 11 | Integration | inbound assignment + idempotent result callback + outbox | contract test |
| 12 | Hardening | rate limits, input validation, secret audit, no-key-in-APK check | security checklist |

**MVP cut (PRD §84/§99-P0):** stages 1–9 = Gatekeeper Handling, Government CS, 5 scenarios, Practice mode, passing score 80.

---

## 7. Key Risks & Mitigations

| # | Risk | Severity | Mitigation |
|---|---|---|---|
| R1 | **No Android toolchain installed**; building an APK here is heavy (~4–6 GB SDK) and no emulator/KVM guaranteed → "works" unverifiable at runtime | **HIGH** | Install JDK17+cmdline-tools, build a **debug APK** as build-gate; keep Android UI thin & testable; provide manual test script. Decide: build now or backend-first? |
| R2 | **TTS not on any configured provider** | HIGH | ✅ resolved: edge-tts `id-ID-ArdiNeural`/`GadisNeural` verified working; wrapped in abstraction so it's swappable. |
| R3 | Voice latency budget 1–3 s across STT→LLM→TTS | MED | Use `orimax_fast` for roleplay turns, `orimax_pro` for evaluation; stream TTS; measure. |
| R4 | LLM hallucinating product specs / procurement facts (PRD §28, §64) | HIGH | Product knowledge only from `trainer_product_knowledge`; evaluation guardrails; "informasi tidak tersedia" rule; automated hallucination tests. |
| R5 | LLM returns malformed JSON for evaluation | MED | zod schema validation + bounded retry + rejection (never persist invalid). |
| R6 | Historical eval mutation via prompt/rubric edits (PRD §67) | HIGH | version tables + FK from evaluation; append-only; DB-level guard + test. |
| R7 | Shared Postgres — schema collision with analytics | LOW | strict `trainer_*` prefix; own migrations; no ALTER of existing tables. |
| R8 | Idempotency of result callback (PRD §82) | MED | `trainer_result_outbox` UNIQUE(session_id) + ON CONFLICT DO NOTHING. |
| R9 | Barge-in requires streaming/duplex audio | MED | interrupt endpoint cancels TTS task; Android stops playback on VAD. |
| R10 | Disk at 86% (65 GB free) — SDK + Gradle + Docker images | MED | monitor; prune build cache; SDK is the main consumer. |

---

## 8. Decisions Needed Before Coding

1. **Project location** — standalone `~/agi-ai-sales-trainer/` (own backend + Android, own `trainer_*` schema on the shared Postgres) — *recommended* — vs. a module inside `orimax-sirup-dashboard`.
2. **Android toolchain** — install JDK17 + Android SDK + Gradle now and gate on a debug APK build, vs. backend-first (Android source written, compiled later).
3. **TTS provider** — edge-tts (`id-ID`) behind abstraction — *recommended* — vs. require a commercial TTS key.
4. **Build order** — backend-first full P0 then Android, vs. thin end-to-end vertical slice early (recommended for de-risking voice).
