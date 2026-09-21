-- =============================================================================
-- 012_ai_analysis_engine.sql
-- Task 04: AI Behavioral Analysis Engine, Confidence & Human Review.
-- Namespaced under trainer_*, safe to re-run.
-- =============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS trainer_ai_analyses (
    id SERIAL PRIMARY KEY,
    type VARCHAR(32) NOT NULL, -- 'call' | 'whatsapp' | 'behavior'
    reference_id INT NOT NULL, -- call_id or whatsapp_id
    sales_id BIGINT NOT NULL,
    overall_score INT,
    confidence_score NUMERIC(4,2) NOT NULL DEFAULT 0.85,
    status VARCHAR(32) NOT NULL DEFAULT 'COMPLETED', -- 'COMPLETED' | 'NEEDS_HUMAN_REVIEW' | 'FAILED' | 'OVERRIDDEN'
    analysis_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    human_review JSONB, -- { reviewed_by, override_scores, manager_notes, reviewed_at }
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_trainer_ai_analyses_ref ON trainer_ai_analyses(type, reference_id);
CREATE INDEX IF NOT EXISTS idx_trainer_ai_analyses_sales ON trainer_ai_analyses(sales_id);
CREATE INDEX IF NOT EXISTS idx_trainer_ai_analyses_status ON trainer_ai_analyses(status);

COMMIT;
