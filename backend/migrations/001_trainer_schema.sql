-- =============================================================================
-- 001_trainer_schema.sql
-- AGI AI Sales Trainer — core schema (PRD §50–§60)
--
-- Namespace: every table is prefixed `trainer_` so this schema can coexist with
-- the Sales Analytics schema on the same Postgres instance (risk R7).
-- Additive only: no existing table is created, altered, or dropped.
-- Safe to re-run: IF NOT EXISTS / DO blocks throughout.
--
-- Immutability (PRD §60, §67): trainer_evaluations and
-- trainer_competency_scores pin the prompt_version_id + ai_model actually used.
-- Modules/scenarios/rubrics/prompts are versioned — editing creates a NEW row,
-- so historical evaluations never mutate.
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- Content versioning helper: a module/scenario/rubric/prompt edit inserts a new
-- row with version = max(version)+1 for the same logical key, and flips the
-- previous row's `active` to false. Enforced in application code; the DB keeps
-- `version` + `active` so historical evaluations can always resolve the exact
-- content revision they were scored against.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- trainer_personas — the AI customer identities used for roleplay (§30).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS trainer_personas (
    id                    SERIAL PRIMARY KEY,
    name                  VARCHAR(120) NOT NULL,
    type                  VARCHAR(64),          -- e.g. 'government_cs'
    role                  VARCHAR(120),         -- e.g. 'Staf Pengadaan'
    attitude              VARCHAR(64),          -- e.g. 'defensive'
    communication_style   VARCHAR(64),          -- e.g. 'formal_bureaucratic'
    knowledge_level       VARCHAR(32),          -- low | medium | high
    interest_level        VARCHAR(32),          -- low | medium | high
    urgency               VARCHAR(32),          -- low | medium | high
    existing_vendor       VARCHAR(120),
    budget_condition      VARCHAR(64),
    default_resistance    INT NOT NULL DEFAULT 3,  -- 1..5
    active                BOOLEAN NOT NULL DEFAULT true,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- trainer_modules — training curriculum units (§51).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS trainer_modules (
    id             SERIAL PRIMARY KEY,
    code           VARCHAR(64) NOT NULL,
    name           VARCHAR(200) NOT NULL,
    description    TEXT,
    category       VARCHAR(64),
    difficulty     VARCHAR(32),                -- basic | intermediate | advanced
    passing_score  INT NOT NULL DEFAULT 80,
    max_attempt    INT NOT NULL DEFAULT 3,
    status         VARCHAR(32) NOT NULL DEFAULT 'DRAFT',  -- DRAFT..ACTIVE
    active         BOOLEAN NOT NULL DEFAULT true,
    version        INT NOT NULL DEFAULT 1,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One ACTIVE version per module code (historical versions stay for FK safety).
CREATE UNIQUE INDEX IF NOT EXISTS uq_trainer_modules_code_version
    ON trainer_modules (code, version);

-- ---------------------------------------------------------------------------
-- trainer_scenarios — roleplay situations inside a module (§52).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS trainer_scenarios (
    id                    SERIAL PRIMARY KEY,
    module_id             INT NOT NULL REFERENCES trainer_modules(id) ON DELETE CASCADE,
    name                  VARCHAR(200) NOT NULL,
    description           TEXT,
    persona_id            INT REFERENCES trainer_personas(id) ON DELETE SET NULL,
    difficulty            VARCHAR(32),
    resistance_level      INT NOT NULL DEFAULT 3,   -- 1..5
    product_category      VARCHAR(120),
    institution_type      VARCHAR(120),
    objective             TEXT,
    success_criteria      TEXT,
    failure_criteria      TEXT,
    rup_context_required  BOOLEAN NOT NULL DEFAULT false,
    status                VARCHAR(32) NOT NULL DEFAULT 'DRAFT',
    active                BOOLEAN NOT NULL DEFAULT true,
    version               INT NOT NULL DEFAULT 1,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_trainer_scenarios_module
    ON trainer_scenarios (module_id, active);

-- ---------------------------------------------------------------------------
-- trainer_rubrics — weighted scoring criteria per module (§53).
-- Application invariant: Σ weight = 100 per (module_id, version) set.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS trainer_rubrics (
    id                   SERIAL PRIMARY KEY,
    module_id            INT NOT NULL REFERENCES trainer_modules(id) ON DELETE CASCADE,
    name                 VARCHAR(200) NOT NULL,
    competency           VARCHAR(120) NOT NULL,
    weight               INT NOT NULL,
    criteria             TEXT,
    scoring_instruction  TEXT,
    active               BOOLEAN NOT NULL DEFAULT true,
    version              INT NOT NULL DEFAULT 1,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT ck_trainer_rubrics_weight CHECK (weight > 0 AND weight <= 100)
);

CREATE INDEX IF NOT EXISTS idx_trainer_rubrics_module
    ON trainer_rubrics (module_id, version, active);

-- ---------------------------------------------------------------------------
-- trainer_prompts — versioned prompt templates (§62, §67).
-- key identifies the slot; (key, version) is unique. Exactly one active row
-- per key is expected (application-enforced).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS trainer_prompts (
    id          SERIAL PRIMARY KEY,
    key         VARCHAR(64) NOT NULL,   -- system | persona | scenario | business | rules | evaluation
    version     INT NOT NULL,
    content     TEXT NOT NULL,
    active      BOOLEAN NOT NULL DEFAULT true,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_trainer_prompts_key_version UNIQUE (key, version)
);

-- ---------------------------------------------------------------------------
-- trainer_product_knowledge — the ONLY sanctioned source of product facts
-- fed to the LLM (risk R4: hallucination control).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS trainer_product_knowledge (
    id          SERIAL PRIMARY KEY,
    category    VARCHAR(120),
    name        VARCHAR(200) NOT NULL,
    payload     JSONB NOT NULL DEFAULT '{}'::jsonb,
    version     INT NOT NULL DEFAULT 1,
    status      VARCHAR(32) NOT NULL DEFAULT 'DRAFT',
    active      BOOLEAN NOT NULL DEFAULT true,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- trainer_assignments — inbound training need from Sales Analytics (§80).
-- `sales_id` references the EXISTING users table (reused, not duplicated).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS trainer_assignments (
    id            SERIAL PRIMARY KEY,
    sales_id      BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    module_id     INT NOT NULL REFERENCES trainer_modules(id) ON DELETE RESTRICT,
    skill         VARCHAR(120),
    priority      VARCHAR(32) NOT NULL DEFAULT 'normal',
    target_score  INT,
    context       JSONB NOT NULL DEFAULT '{}'::jsonb,
    status        VARCHAR(32) NOT NULL DEFAULT 'assigned',
    due_date      DATE,
    max_attempt   INT NOT NULL DEFAULT 3,
    source        VARCHAR(64) NOT NULL DEFAULT 'analytics',
    external_ref  VARCHAR(200),
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Idempotent inbound: the same external training-need cannot be assigned twice.
CREATE UNIQUE INDEX IF NOT EXISTS uq_trainer_assignments_external
    ON trainer_assignments (source, external_ref)
    WHERE external_ref IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_trainer_assignments_sales
    ON trainer_assignments (sales_id, status);

-- ---------------------------------------------------------------------------
-- trainer_sessions — one roleplay attempt (§54).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS trainer_sessions (
    id                SERIAL PRIMARY KEY,
    assignment_id     INT REFERENCES trainer_assignments(id) ON DELETE SET NULL,
    sales_id          BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    scenario_id       INT NOT NULL REFERENCES trainer_scenarios(id) ON DELETE RESTRICT,
    attempt           INT NOT NULL DEFAULT 1,
    mode              VARCHAR(32) NOT NULL DEFAULT 'practice',  -- practice | exam
    started_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    ended_at          TIMESTAMPTZ,
    duration_seconds  INT,
    status            VARCHAR(32) NOT NULL DEFAULT 'in_progress',
    audio_ref         TEXT,
    transcript_ref    TEXT,
    used_hint         BOOLEAN NOT NULL DEFAULT false,
    eval_status       VARCHAR(32) NOT NULL DEFAULT 'pending',
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_trainer_sessions_sales
    ON trainer_sessions (sales_id, status);
CREATE INDEX IF NOT EXISTS idx_trainer_sessions_eval
    ON trainer_sessions (eval_status);

-- ---------------------------------------------------------------------------
-- trainer_turns — the conversation transcript, one row per utterance (§55).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS trainer_turns (
    id               SERIAL PRIMARY KEY,
    session_id       INT NOT NULL REFERENCES trainer_sessions(id) ON DELETE CASCADE,
    turn_id          VARCHAR(64),
    speaker          VARCHAR(16) NOT NULL,   -- AI | SALES
    text             TEXT,
    timestamp        TIMESTAMPTZ NOT NULL DEFAULT now(),
    audio_ref        TEXT,
    sequence_number  INT NOT NULL DEFAULT 0,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT ck_trainer_turns_speaker CHECK (speaker IN ('AI', 'SALES'))
);

CREATE INDEX IF NOT EXISTS idx_trainer_turns_session
    ON trainer_turns (session_id, sequence_number);

-- ---------------------------------------------------------------------------
-- trainer_evaluations — IMMUTABLE evaluation result (§60).
-- Pins ai_model + prompt_version_id so a later prompt/rubric edit cannot
-- retroactively change what this score meant.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS trainer_evaluations (
    id                 SERIAL PRIMARY KEY,
    session_id         INT NOT NULL UNIQUE REFERENCES trainer_sessions(id) ON DELETE CASCADE,
    overall_score      INT,
    status             VARCHAR(32) NOT NULL DEFAULT 'completed',
    feedback           JSONB NOT NULL DEFAULT '{}'::jsonb,
    strengths          TEXT[] NOT NULL DEFAULT '{}',
    weaknesses         TEXT[] NOT NULL DEFAULT '{}',
    critical_errors    TEXT[] NOT NULL DEFAULT '{}',
    recommendation     TEXT,
    confidence         REAL,
    ai_model           VARCHAR(120),
    prompt_version_id  INT REFERENCES trainer_prompts(id) ON DELETE SET NULL,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- trainer_competency_scores — per-competency breakdown with evidence (§56).
-- `evidence` is mandatory in application code (guardrail, §64).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS trainer_competency_scores (
    id             SERIAL PRIMARY KEY,
    evaluation_id  INT NOT NULL REFERENCES trainer_evaluations(id) ON DELETE CASCADE,
    competency     VARCHAR(120) NOT NULL,
    score          INT,
    weight         INT,
    evidence       TEXT,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_trainer_competency_eval
    ON trainer_competency_scores (evaluation_id);

-- ---------------------------------------------------------------------------
-- trainer_progress — rolled-up per sales × module performance (§57).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS trainer_progress (
    id             SERIAL PRIMARY KEY,
    sales_id       BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    module_id      INT NOT NULL REFERENCES trainer_modules(id) ON DELETE CASCADE,
    first_score    INT,
    latest_score   INT,
    highest_score  INT,
    avg_score      NUMERIC(5,2),
    attempts       INT NOT NULL DEFAULT 0,
    improvement    INT,
    pass_status    VARCHAR(32) NOT NULL DEFAULT 'not_passed',
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_trainer_progress UNIQUE (sales_id, module_id)
);

-- ---------------------------------------------------------------------------
-- trainer_certifications — P2, but defined now so the model is complete (§58).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS trainer_certifications (
    id          SERIAL PRIMARY KEY,
    sales_id    BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    level       VARCHAR(64),
    status      VARCHAR(32) NOT NULL DEFAULT 'pending',
    score       INT,
    awarded_at  TIMESTAMPTZ,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- trainer_result_outbox — guarantees the callback to Sales Analytics is
-- delivered exactly once per session (§82, risk R8).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS trainer_result_outbox (
    id            SERIAL PRIMARY KEY,
    session_id    INT NOT NULL UNIQUE REFERENCES trainer_sessions(id) ON DELETE CASCADE,
    payload       JSONB NOT NULL,
    delivered_at  TIMESTAMPTZ,
    attempts      INT NOT NULL DEFAULT 0,
    last_error    TEXT,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_trainer_outbox_pending
    ON trainer_result_outbox (delivered_at) WHERE delivered_at IS NULL;

-- ---------------------------------------------------------------------------
-- updated_at maintenance — mirror the existing convention (set_updated_at()
-- already exists in the analytics schema; create it only if absent).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION trainer_set_updated_at() RETURNS trigger AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
DECLARE
    t TEXT;
BEGIN
    FOREACH t IN ARRAY ARRAY[
        'trainer_personas', 'trainer_modules', 'trainer_scenarios',
        'trainer_rubrics', 'trainer_product_knowledge', 'trainer_assignments',
        'trainer_sessions', 'trainer_progress', 'trainer_result_outbox'
    ] LOOP
        EXECUTE format(
            'DROP TRIGGER IF EXISTS trg_%1$s_updated ON %1$s; '
            'CREATE TRIGGER trg_%1$s_updated BEFORE UPDATE ON %1$s '
            'FOR EACH ROW EXECUTE FUNCTION trainer_set_updated_at();', t);
    END LOOP;
END $$;

COMMIT;
