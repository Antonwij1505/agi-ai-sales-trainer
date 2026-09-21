-- =============================================================================
-- 011_crm_calls_whatsapp_funnel.sql
-- Task 03: Call, Transcript, WhatsApp, Customer, and 14-Stage Sales Funnel.
-- Namespaced under trainer_*, safe to re-run.
-- =============================================================================

BEGIN;

-- 1. Customers Table
CREATE TABLE IF NOT EXISTS trainer_customers (
    id SERIAL PRIMARY KEY,
    customer_code VARCHAR(64) UNIQUE,
    name VARCHAR(200) NOT NULL,
    type VARCHAR(64) DEFAULT 'B2G',
    industry VARCHAR(120),
    organization VARCHAR(200),
    contact JSONB NOT NULL DEFAULT '{}'::jsonb, -- { phone, email, address }
    status VARCHAR(32) NOT NULL DEFAULT 'active',
    funnel_stage VARCHAR(64) NOT NULL DEFAULT 'TARGET',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_trainer_customers_code ON trainer_customers(customer_code);
CREATE INDEX IF NOT EXISTS idx_trainer_customers_stage ON trainer_customers(funnel_stage);

-- 2. Calls Table
CREATE TABLE IF NOT EXISTS trainer_calls (
    id SERIAL PRIMARY KEY,
    sales_id BIGINT NOT NULL,
    customer_id INT REFERENCES trainer_customers(id) ON DELETE CASCADE,
    call_date TIMESTAMPTZ NOT NULL DEFAULT now(),
    duration_seconds INT NOT NULL DEFAULT 0,
    audio_url TEXT,
    transcript TEXT,
    funnel_stage VARCHAR(64) NOT NULL DEFAULT 'CALL ATTEMPT',
    outcome VARCHAR(120),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_trainer_calls_sales ON trainer_calls(sales_id);
CREATE INDEX IF NOT EXISTS idx_trainer_calls_customer ON trainer_calls(customer_id);

-- 3. WhatsApp Conversations Table
CREATE TABLE IF NOT EXISTS trainer_whatsapp_conversations (
    id SERIAL PRIMARY KEY,
    sales_id BIGINT NOT NULL,
    customer_id INT REFERENCES trainer_customers(id) ON DELETE CASCADE,
    conversation_date TIMESTAMPTZ NOT NULL DEFAULT now(),
    messages JSONB NOT NULL DEFAULT '[]'::jsonb, -- [{ sender, message, timestamp }]
    outcome VARCHAR(120),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_trainer_wa_customer ON trainer_whatsapp_conversations(customer_id);

COMMIT;
