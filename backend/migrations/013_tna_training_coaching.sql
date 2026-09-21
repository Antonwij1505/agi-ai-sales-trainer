-- =============================================================================
-- 013_tna_training_coaching.sql
-- Tasks 05 & 06: Training Need Analysis, Training Management, Assessments, Coaching & Effectiveness.
-- Namespaced under trainer_*, safe to re-run.
-- =============================================================================

BEGIN;

-- 1. TNA Priority Configuration
CREATE TABLE IF NOT EXISTS trainer_tna_configs (
    id SERIAL PRIMARY KEY,
    key VARCHAR(64) UNIQUE NOT NULL,
    value JSONB NOT NULL DEFAULT '{}'::jsonb,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO trainer_tna_configs (key, value) VALUES
    ('priority_weights', '{"gap_weight": 0.4, "error_freq_weight": 0.2, "business_impact_weight": 0.2, "severity_weight": 0.2}'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- 2. TNA Results Table
CREATE TABLE IF NOT EXISTS trainer_tna_results (
    id SERIAL PRIMARY KEY,
    sales_id BIGINT NOT NULL,
    competency VARCHAR(120) NOT NULL,
    current_score INT NOT NULL,
    target_score INT NOT NULL DEFAULT 75,
    gap INT NOT NULL,
    error_frequency INT NOT NULL DEFAULT 1,
    severity INT NOT NULL DEFAULT 1,
    business_impact INT NOT NULL DEFAULT 1,
    priority_score NUMERIC(5,2) NOT NULL,
    priority_level VARCHAR(16) NOT NULL, -- 'HIGH' | 'MEDIUM' | 'LOW'
    recommended_training TEXT,
    recommended_practice TEXT,
    evidence_references JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_trainer_tna_sales ON trainer_tna_results(sales_id);
CREATE INDEX IF NOT EXISTS idx_trainer_tna_priority ON trainer_tna_results(priority_level);

-- 3. Training Catalog & Modules (Task 06)
CREATE TABLE IF NOT EXISTS trainer_training_catalog (
    id SERIAL PRIMARY KEY,
    title VARCHAR(200) NOT NULL,
    objective TEXT,
    competency VARCHAR(120) NOT NULL,
    level VARCHAR(32) NOT NULL DEFAULT 'Level 1',
    duration_minutes INT NOT NULL DEFAULT 60,
    material TEXT,
    examples TEXT,
    case_study TEXT,
    roleplay TEXT,
    exercise TEXT,
    quiz JSONB NOT NULL DEFAULT '[]'::jsonb,
    passing_score INT NOT NULL DEFAULT 80,
    month_roadmap INT, -- 1..12
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Seed Default 12-Month Roadmap (Q1..Q4)
INSERT INTO trainer_training_catalog (title, objective, competency, level, month_roadmap) VALUES
    ('Month 1 — Sales Mindset & Fundamentals', 'Membangun pemahaman dasar pengadaan B2G', 'Professionalism / Compliance', 'Level 1', 1),
    ('Month 2 — Opening & Gatekeeper', 'Teknik membuka telepon dan menembus gatekeeper', 'Opening', 'Level 1', 2),
    ('Month 3 — Advanced Gatekeeper', 'Handling gatekeeper persisten dan sekretaris dinas', 'Gatekeeper Handling', 'Level 2', 3),
    ('Month 4 — Probing', 'Menggali kebutuhan RUP dan jadwal pengadaan', 'Probing', 'Level 1', 4),
    ('Month 5 — Objection Handling', 'Menangani keberatan anggaran dan spesifikasi', 'Objection Handling', 'Level 1', 5),
    ('Month 6 — Value Proposition', 'Menyampaikan keunggulan TKDN dan garansi ORIMAX', 'Value Proposition', 'Level 1', 6),
    ('Month 7 — WhatsApp Selling', 'Komunikasi profesional via WhatsApp B2G', 'Communication', 'Level 1', 7),
    ('Month 8 — Follow-up', 'Nurturing prospek tanpa terkesan menagih', 'Follow-up', 'Level 1', 8),
    ('Month 9 — Closing & Opportunity', 'Kunci kesepakatan jadwal demonstrasi / HPS', 'Closing / Next Step', 'Level 1', 9),
    ('Month 10 — Advanced Negotiation', 'Negosiasi paket pengadaan bernilai tinggi', 'Closing / Next Step', 'Level 2', 10),
    ('Month 11 — Strategic Account Communication', 'Bina hubungan dengan Pejabat Pembuat Komitmen', 'Communication', 'Level 2', 11),
    ('Month 12 — Sales Excellence Certification', 'Ujian sertifikasi akhir kompetensi sales B2G', 'Professionalism / Compliance', 'Level 3', 12)
ON CONFLICT DO NOTHING;

-- 4. Training Assessments
CREATE TABLE IF NOT EXISTS trainer_assessments (
    id SERIAL PRIMARY KEY,
    sales_id BIGINT NOT NULL,
    catalog_id INT REFERENCES trainer_training_catalog(id) ON DELETE CASCADE,
    type VARCHAR(32) NOT NULL, -- 'pre-test' | 'post-test' | 'practical' | 'roleplay'
    score INT NOT NULL,
    passed BOOLEAN NOT NULL DEFAULT false,
    feedback TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 5. Coaching Logs
CREATE TABLE IF NOT EXISTS trainer_coaching_logs (
    id SERIAL PRIMARY KEY,
    employee_id BIGINT NOT NULL,
    coach_id BIGINT NOT NULL,
    problem TEXT NOT NULL,
    evidence TEXT,
    root_cause TEXT,
    action TEXT,
    deadline DATE,
    follow_up_date DATE,
    result TEXT,
    status VARCHAR(32) NOT NULL DEFAULT 'OPEN', -- 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED'
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 6. Training Effectiveness Evaluations
CREATE TABLE IF NOT EXISTS trainer_effectiveness_evaluations (
    id SERIAL PRIMARY KEY,
    sales_id BIGINT NOT NULL,
    catalog_id INT REFERENCES trainer_training_catalog(id) ON DELETE CASCADE,
    knowledge_improvement NUMERIC(5,2) NOT NULL, -- 30%
    behavior_improvement NUMERIC(5,2) NOT NULL,  -- 30%
    business_impact_score NUMERIC(5,2) NOT NULL, -- 40%
    overall_effectiveness NUMERIC(5,2) NOT NULL,
    category VARCHAR(32) NOT NULL, -- 'Highly Effective' | 'Effective' | 'Partially Effective' | 'Ineffective'
    evaluation_stage VARCHAR(16) NOT NULL DEFAULT 'T0', -- T0, T1, T2 (+7d), T3 (+30d), T4 (+60d), T5 (+90d)
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMIT;
