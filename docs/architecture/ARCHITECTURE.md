# Architecture Specification: AGI AI Sales Trainer

## 1. Current Architecture

The system is structured as a decoupled client-server architecture tailored for mobile-first B2B sales training at PT. Aston Graphindo Indonesia (PT. AGI):

- **Client**: Native Android application built with Kotlin and Jetpack Compose targeting Android SDK 35 (API 35). Implements Material 3 with custom glassmorphism and gradient design tokens.
- **Backend API**: Express.js REST and WebSocket server running on Node.js 20+ with TypeScript (`backend/`, port `4100`).
- **Database**: PostgreSQL (shared or standalone instance) using a strictly namespaced `trainer_*` schema to safely coexist with existing Sales Analytics tables.
- **AI Layer**: Proxy-based architecture where the Android client holds **zero API keys**. The backend proxies requests to Gemini Live (speech-to-speech), 9router / DeepSeek, Groq Whisper (STT), and Edge-TTS (TTS).
- **Integration**: Outbox pattern (`trainer_result_outbox`) guarantees idempotent asynchronous delivery of training results back to Sales Analytics.

---

## 2. Proposed Architecture

- **Stateless Edge Proxy**: Backend acts as a secure WebSocket and REST relay, isolating upstream AI providers and enforcing strict rate limits (`express-rate-limit`) and security headers (`helmet`).
- **Idempotent Outbox Worker**: Dedicated background worker poller (`backend/src/worker.ts`) dispatches evaluation outcomes and score metrics to parent systems without blocking roleplay sessions.
- **Versioned Content Engine**: All prompts, modules, scenarios, and rubrics maintain version history so historical evaluations remain immutable.

---

## 3. Component Details

### Frontend (Android / Kotlin)
- **UI Framework**: Jetpack Compose with reactive `StateFlow` and `ViewModel`.
- **Audio Pipeline**: `VoiceRecorder`, `StreamingRecorder`, `TurnDetector` for VAD / silence detection, and `StreamingPlayer` / `ReplyPlayer` for audio playback.
- **Security**: Stateless JWT storage (`TokenStore`), no hardcoded secrets or AI API keys on device.

### Backend (Node.js / Express)
- **Runtime**: TypeScript (`tsx watch` for dev, compiled via `tsc` to `dist/`).
- **Middleware**: JWT authentication (`auth.middleware.ts`), error boundary (`error.middleware.ts`), rate limiting (`rateLimit.middleware.ts`), CORS, Helmet.
- **Services**: Modular service layer (`roleplay.service.ts`, `evaluation.service.ts`, `live.service.ts`, `stt.service.ts`, `tts.service.ts`, `prompt.service.ts`, `integration.service.ts`).

### Database
- PostgreSQL relational database using parameterized queries (`pg` pool).
- Strict migration runner (`backend/src/db/migrate.ts`) executing additive SQL files (`001_` through `008_`).

### AI Layer
- **Speech-to-Speech**: Gemini Live API relay via WebSocket (`/api/v1/ws/live`).
- **Evaluator / Fallback LLM**: 9router / DeepSeek gateways with robust guardrails and evidence extraction.
- **STT/TTS**: Groq Whisper (Indonesian) and Edge-TTS (Indonesian voice profiles).

### Storage
- Ephemeral audio buffer handling in memory / temp files, storing references (`audio_ref`, `transcript_ref`) in database tables.

### Authentication & Authorization
- **Auth**: JWT-based authentication issued upon successful credential verification (`/api/v1/auth/login`).
- **RBAC**: Role distinction between `sales` (trainee) and `admin` (curriculum and prompt manager).

### Integration & Testing
- **Integration**: Outbox table (`trainer_result_outbox`) polling worker for downstream synchronization.
- **Testing**: Deterministic unit tests for guardrails (`guardrails.test.ts`), instrumented Android Compose UI tests (`ResultScreenTest`).
