-- =============================================================================
-- 000_analytics_base.sql — the minimal Sales Analytics base that the trainer
-- schema depends on.
--
-- WHY THIS EXISTS
-- ---------------
-- `trainer_assignments`, `trainer_sessions`, `trainer_progress` and
-- `trainer_certifications` all carry `sales_id BIGINT REFERENCES users(id)`.
-- In production the trainer shares the Sales Analytics Postgres, so that table
-- is already there. A standalone compose stack does not have it, and the trainer
-- migrations would fail with "relation users does not exist".
--
-- This file recreates ONLY what the trainer touches: `users` (for the FK and for
-- login) and `filter_config` (the runtime credential store read by
-- config/credentials.ts). It is a subset of the real Sales Analytics schema —
-- NOT a replacement. If you point this stack at the real analytics database,
-- this file is redundant (every statement is IF NOT EXISTS / ON CONFLICT).
--
-- DEMO CREDENTIALS (local development only):
--   admin / admin123   (role: admin)
--   sales / sales123   (role: sales)
-- These match the documented seed accounts of the analytics project so the same
-- login works on both services. NEVER use this file in production.
-- =============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS users (
  id                    BIGSERIAL PRIMARY KEY,
  username              TEXT NOT NULL UNIQUE,
  password_hash         TEXT NOT NULL,
  role                  TEXT NOT NULL DEFAULT 'sales'
                          CHECK (role IN ('admin', 'sales', 'spv', 'manager')),
  nama_lengkap          TEXT NOT NULL,
  provinsi_list         TEXT[] NOT NULL DEFAULT '{}',
  kabkota_list          TEXT[] NOT NULL DEFAULT '{}',
  active                BOOLEAN NOT NULL DEFAULT TRUE,
  parent_spv_id         BIGINT REFERENCES users(id) ON DELETE SET NULL,
  no_telp               TEXT,
  device_encryption_key TEXT,
  odoo_username         TEXT DEFAULT '',
  odoo_password         TEXT DEFAULT '',
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);

-- Runtime credential store. The trainer only ever SELECTs from it
-- (config/credentials.ts); admin tooling writes the rows.
CREATE TABLE IF NOT EXISTS filter_config (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Demo accounts. The hashes below are bcrypt cost-12 of the documented demo
-- passwords; they grant access to a throwaway local database only.
INSERT INTO users (username, password_hash, role, nama_lengkap)
VALUES
  ('admin', '$2b$12$Gf35cKsxegDdAe1NuqMF4eP/KMZPmtxtTd9lIrTfuNI956Z7rgySq', 'admin', 'Administrator'),
  ('sales', '$2b$12$AA6i53W04lPvFWYKUwGHnORbjEVQ2BZ3SS5qDChGp6sRahWMDJzpa', 'sales', 'Sales Demo')
ON CONFLICT (username) DO NOTHING;

COMMIT;
