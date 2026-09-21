-- =============================================================================
-- 014_kpi_dashboard_reporting.sql
-- Task 07: KPI, Dashboard & Reporting (Activity, Quality, Conversion, Business, Productivity).
-- Namespaced under trainer_*, safe to re-run.
-- =============================================================================

BEGIN;

-- Sales Orders table for Business KPI (Revenue, Gross Profit, Repeat Order)
CREATE TABLE IF NOT EXISTS trainer_sales_orders (
    id SERIAL PRIMARY KEY,
    sales_id BIGINT NOT NULL,
    customer_id INT REFERENCES trainer_customers(id) ON DELETE CASCADE,
    order_value NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    gross_profit NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    status VARCHAR(32) NOT NULL DEFAULT 'ORDER', -- 'ORDER' | 'REVENUE' | 'CANCELLED'
    order_date TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_trainer_orders_sales ON trainer_sales_orders(sales_id);
CREATE INDEX IF NOT EXISTS idx_trainer_orders_date ON trainer_sales_orders(order_date);

COMMIT;
