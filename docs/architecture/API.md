# High-Level API Contract: AGI AI Sales Trainer

Base URL: `http://<host>:4100/api/v1`

All authenticated endpoints require a valid JWT Bearer token in the `Authorization` header (`Bearer <token>`).

---

## 1. Authentication & Health

- **`POST /auth/login`**
  - Request: `{ "username": "string", "password": "string" }`
  - Response: `{ "token": "jwt_token", "user": { "id": 1, "username": "sales", "role": "sales" } }`

- **`GET /health/ready`**
  - Response: `{ "status": "ready", "trainer_tables": 14 }`

- **`GET /health/live`**
  - Response: `{ "status": "alive" }`

---

## 2. Catalog & Modules

- **`GET /modules`**
  - Returns list of active training modules and scenarios.

- **`GET /modules/:id`**
  - Returns detailed module metadata, personas, and associated rubrics.

---

## 3. Roleplay Sessions

- **`POST /sessions`**
  - Request: `{ "scenario_id": 1, "mode": "practice" }`
  - Response: `{ "session_id": 123, "opening_line": "...", "status": "in_progress" }`

- **`POST /sessions/:id/turns`**
  - Request: `{ "text": "...", "audio_ref": "..." }`
  - Response: `{ "turn_id": "...", "ai_response": "...", "audio_url": "..." }`

- **`POST /sessions/:id/evaluate`**
  - Triggers final scoring and outbox enqueuing.
  - Response: `{ "evaluation_id": 45, "overall_score": 85, "passed": true, "competencies": [...] }`

---

## 4. Progress & Analytics

- **`GET /progress`**
  - Returns aggregated training progress and scores across modules for the authenticated sales user.

---

## 5. Admin & Prompt Management

- **`GET /admin/prompts`**
  - Returns versioned system prompts and configuration templates.

- **`POST /admin/prompts`**
  - Creates a new prompt version and updates active status.

---

## 6. Realtime Audio WebSocket

- **`WS /ws/live`**
  - WebSocket endpoint for Gemini Live speech-to-speech streaming relay (audio in / audio out).
