-- =============================================================================
-- 010_employee_competency_framework.sql
-- Task 02: Employee Management & Competency Framework (Weights summing to 100%).
-- Namespaced under trainer_*, safe to re-run.
-- =============================================================================

BEGIN;

-- 1. Employees Table
CREATE TABLE IF NOT EXISTS trainer_employees (
    id SERIAL PRIMARY KEY,
    employee_code VARCHAR(64) UNIQUE NOT NULL,
    name VARCHAR(200) NOT NULL,
    position VARCHAR(120),
    department VARCHAR(120),
    supervisor VARCHAR(120),
    status VARCHAR(32) NOT NULL DEFAULT 'active', -- active | inactive
    join_date DATE,
    user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_trainer_employees_code ON trainer_employees(employee_code);
CREATE INDEX IF NOT EXISTS idx_trainer_employees_status ON trainer_employees(status);

-- 2. Competency Definitions Table (Configurable framework & weights)
CREATE TABLE IF NOT EXISTS trainer_competency_definitions (
    id SERIAL PRIMARY KEY,
    name VARCHAR(120) UNIQUE NOT NULL,
    weight INT NOT NULL, -- percentage (0-100)
    critical_threshold INT NOT NULL DEFAULT 60, -- minimum acceptable score before critical fail
    description TEXT,
    active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT ck_competency_weight CHECK (weight > 0 AND weight <= 100)
);

-- Seed Default 9 Competencies (Total weight = 100%)
INSERT INTO trainer_competency_definitions (name, weight, critical_threshold, description) VALUES
    ('Opening', 10, 60, 'Initial greeting and professional introduction'),
    ('Communication', 10, 60, 'Clarity, tone, and pacing during conversation'),
    ('Gatekeeper Handling', 20, 70, 'Handling administrative obstacles and securing decision maker access (Critical)'),
    ('Probing', 15, 60, 'Asking relevant discovery and needs assessment questions'),
    ('Objection Handling', 15, 60, 'Addressing customer pushback and hesitation effectively'),
    ('Value Proposition', 10, 60, 'Presenting product benefits aligned with government/B2B context'),
    ('Closing / Next Step', 10, 60, 'Securing clear next steps or commitments'),
    ('Follow-up', 5, 60, 'Establishing structured follow-up plan'),
    ('Professionalism / Compliance', 5, 60, 'Adhering to regulatory, ethical, and company standards')
ON CONFLICT (name) DO UPDATE 
SET weight = EXCLUDED.weight, critical_threshold = EXCLUDED.critical_threshold, description = EXCLUDED.description;

COMMIT;
