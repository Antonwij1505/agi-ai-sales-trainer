-- =============================================================================
-- 009_foundation_rbac_audit.sql
-- Task 01: Foundation — RBAC roles, permissions, user mapping, and audit logs.
-- Namespaced under trainer_*, safe to re-run.
-- =============================================================================

BEGIN;

-- 1. Roles Table
CREATE TABLE IF NOT EXISTS trainer_roles (
    id SERIAL PRIMARY KEY,
    name VARCHAR(64) UNIQUE NOT NULL,
    description TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Seed 6 mandatory roles
INSERT INTO trainer_roles (name, description) VALUES
    ('super_admin', 'Super Administrator with full system access'),
    ('management', 'Executive Management view and reports'),
    ('hr_manager', 'HR / Training Manager overseeing TNA and curriculum'),
    ('sales_supervisor', 'Sales Manager / Supervisor overseeing team KPIs and coaching'),
    ('trainer', 'Trainer / Coach conducting live sessions and assessment'),
    ('sales', 'Sales representative undergoing AI training and roleplay')
ON CONFLICT (name) DO NOTHING;

-- 2. Permissions Table (13 menus + operational permissions)
CREATE TABLE IF NOT EXISTS trainer_permissions (
    id SERIAL PRIMARY KEY,
    code VARCHAR(120) UNIQUE NOT NULL,
    description TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO trainer_permissions (code, description) VALUES
    ('menu:dashboard', 'Access Dashboard'),
    ('menu:sales', 'Access Sales'),
    ('menu:calls', 'Access Calls'),
    ('menu:whatsapp', 'Access WhatsApp integration'),
    ('menu:ai_analysis', 'Access AI Analysis'),
    ('menu:competency', 'Access Competency tracking'),
    ('menu:tna', 'Access Training Needs Analysis'),
    ('menu:training', 'Access Training modules'),
    ('menu:assessment', 'Access Assessment & Rubrics'),
    ('menu:coaching', 'Access Coaching logs'),
    ('menu:kpi', 'Access KPI management'),
    ('menu:reports', 'Access Reports'),
    ('menu:settings', 'Access Settings'),
    ('action:create', 'Create entities'),
    ('action:update', 'Update entities'),
    ('action:delete', 'Delete entities'),
    ('action:ai_execute', 'Execute AI actions'),
    ('action:audit_view', 'View audit logs')
ON CONFLICT (code) DO NOTHING;

-- 3. Role-Permissions Mapping
CREATE TABLE IF NOT EXISTS trainer_role_permissions (
    role_id INT REFERENCES trainer_roles(id) ON DELETE CASCADE,
    permission_id INT REFERENCES trainer_permissions(id) ON DELETE CASCADE,
    PRIMARY KEY (role_id, permission_id)
);

-- Assign permissions to roles (Super Admin gets all, Sales gets basic training/dashboard menus)
INSERT INTO trainer_role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM trainer_roles r, trainer_permissions p
WHERE r.name = 'super_admin'
ON CONFLICT DO NOTHING;

-- Management: dashboard, reports, kpi, sales, analytics
INSERT INTO trainer_role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM trainer_roles r, trainer_permissions p
WHERE r.name = 'management' AND p.code IN ('menu:dashboard', 'menu:reports', 'menu:kpi', 'menu:sales', 'menu:ai_analysis')
ON CONFLICT DO NOTHING;

-- HR Manager: tna, training, assessment, competency, reports
INSERT INTO trainer_role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM trainer_roles r, trainer_permissions p
WHERE r.name = 'hr_manager' AND p.code IN ('menu:dashboard', 'menu:tna', 'menu:training', 'menu:assessment', 'menu:competency', 'menu:reports', 'action:create', 'action:update')
ON CONFLICT DO NOTHING;

-- Sales Supervisor: dashboard, sales, calls, whatsapp, coaching, kpi, reports
INSERT INTO trainer_role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM trainer_roles r, trainer_permissions p
WHERE r.name = 'sales_supervisor' AND p.code IN ('menu:dashboard', 'menu:sales', 'menu:calls', 'menu:whatsapp', 'menu:coaching', 'menu:kpi', 'menu:reports', 'action:update')
ON CONFLICT DO NOTHING;

-- Trainer / Coach: dashboard, training, assessment, coaching, competency
INSERT INTO trainer_role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM trainer_roles r, trainer_permissions p
WHERE r.name = 'trainer' AND p.code IN ('menu:dashboard', 'menu:training', 'menu:assessment', 'menu:coaching', 'menu:competency', 'action:create', 'action:update')
ON CONFLICT DO NOTHING;

-- Sales: dashboard, training, assessment, ai_analysis
INSERT INTO trainer_role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM trainer_roles r, trainer_permissions p
WHERE r.name = 'sales' AND p.code IN ('menu:dashboard', 'menu:training', 'menu:assessment', 'menu:ai_analysis', 'action:ai_execute')
ON CONFLICT DO NOTHING;

-- 4. User Roles Mapping (Links users to roles)
CREATE TABLE IF NOT EXISTS trainer_user_roles (
    user_id BIGINT REFERENCES users(id) ON DELETE CASCADE,
    role_id INT REFERENCES trainer_roles(id) ON DELETE CASCADE,
    PRIMARY KEY (user_id, role_id)
);

-- 5. Audit Logs Table
CREATE TABLE IF NOT EXISTS trainer_audit_logs (
    id SERIAL PRIMARY KEY,
    user_id BIGINT,
    username VARCHAR(120),
    action VARCHAR(64) NOT NULL, -- login, logout, create, update, delete, ai_action, permission_sensitive
    entity VARCHAR(120),
    entity_id VARCHAR(120),
    details JSONB NOT NULL DEFAULT '{}'::jsonb,
    ip_address VARCHAR(64),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_trainer_audit_user ON trainer_audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_trainer_audit_action ON trainer_audit_logs(action);

COMMIT;
