import { pool } from '../db/pool.js';
import { HttpError } from '../middleware/error.middleware.js';

export async function getSalesKPIs(salesId?: number, period: 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'annual' = 'monthly') {
  let dateFilter = '1=1';
  if (period === 'daily') dateFilter = "c.call_date >= now() - interval '1 day'";
  else if (period === 'weekly') dateFilter = "c.call_date >= now() - interval '7 days'";
  else if (period === 'monthly') dateFilter = "c.call_date >= now() - interval '30 days'";
  else if (period === 'quarterly') dateFilter = "c.call_date >= now() - interval '90 days'";
  else if (period === 'annual') dateFilter = "c.call_date >= now() - interval '365 days'";

  const salesClause = salesId ? 'AND c.sales_id = $1' : '';
  const orderSalesClause = salesId ? 'AND sales_id = $1' : '';
  const params = salesId ? [salesId] : [];

  // Activity KPIs
  const activityRes = await pool.query(
    `SELECT
       COUNT(c.id)::int AS call_attempt,
       COUNT(CASE WHEN c.funnel_stage NOT IN ('TARGET', 'CALL ATTEMPT') THEN 1 END)::int AS connected,
       (SELECT COUNT(*)::int FROM trainer_whatsapp_conversations w WHERE 1=1 ${salesId ? 'AND w.sales_id = $1' : ''}) AS wa_sent,
       COUNT(CASE WHEN c.funnel_stage = 'FOLLOW-UP' THEN 1 END)::int AS follow_up
     FROM trainer_calls c
     WHERE ${dateFilter} ${salesClause}`,
    params
  );

  // Quality KPIs (average scores from AI analysis)
  const qualityRes = await pool.query(
    `SELECT
       ROUND(AVG(overall_score), 2) AS call_quality,
       (SELECT ROUND(AVG(overall_score), 2) FROM trainer_ai_analyses WHERE type = 'whatsapp' ${salesId ? 'AND sales_id = $1' : ''}) AS wa_quality
     FROM trainer_ai_analyses
     WHERE type = 'call' ${salesId ? 'AND sales_id = $1' : ''}`,
    salesId ? [salesId] : []
  );

  // Funnel / Conversion counts
  const funnelRes = await pool.query(
    `SELECT
       COUNT(CASE WHEN funnel_stage >= 'GATEKEEPER PASSED' THEN 1 END)::int AS gk_passed,
       COUNT(CASE WHEN funnel_stage >= 'PIC IDENTIFIED' THEN 1 END)::int AS pic_identified,
       COUNT(CASE WHEN funnel_stage >= 'PIC CONVERSATION' THEN 1 END)::int AS pic_conversation,
       COUNT(CASE WHEN funnel_stage >= 'NEED IDENTIFIED' THEN 1 END)::int AS need_identified,
       COUNT(CASE WHEN funnel_stage >= 'OPPORTUNITY' THEN 1 END)::int AS opportunity,
       COUNT(CASE WHEN funnel_stage >= 'QUOTATION' THEN 1 END)::int AS quotation,
       COUNT(CASE WHEN funnel_stage >= 'ORDER' THEN 1 END)::int AS orders
     FROM trainer_customers`
  );

  // Business KPIs (Orders & Revenue)
  const businessRes = await pool.query(
    `SELECT
       COALESCE(SUM(order_value), 0)::numeric AS revenue,
       COALESCE(SUM(gross_profit), 0)::numeric AS gross_profit,
       COUNT(DISTINCT customer_id)::int AS customer_acquisition,
       COUNT(CASE WHEN status = 'REVENUE' THEN 1 END)::int AS repeat_order
     FROM trainer_sales_orders
     WHERE 1=1 ${orderSalesClause}`,
    params
  );

  const act = activityRes.rows[0] ?? { call_attempt: 0, connected: 0, wa_sent: 0, follow_up: 0 };
  const qual = qualityRes.rows[0] ?? { call_quality: 0, wa_quality: 0 };
  const fun = funnelRes.rows[0] ?? { gk_passed: 0, pic_identified: 0, pic_conversation: 0, need_identified: 0, opportunity: 0, quotation: 0, orders: 0 };
  const bus = businessRes.rows[0] ?? { revenue: 0, gross_profit: 0, customer_acquisition: 0, repeat_order: 0 };

  // Conversion Rates
  const callAttempt = act.call_attempt || 1;
  const connected = act.connected || 1;
  const picConv = fun.pic_conversation || 1;

  const conversions = {
    gatekeeper_pass_rate: Math.round((fun.gk_passed / callAttempt) * 10000) / 100,
    pic_acquisition_rate: Math.round((fun.pic_identified / callAttempt) * 10000) / 100,
    pic_conversation_rate: Math.round((fun.pic_conversation / callAttempt) * 10000) / 100,
    need_identification_rate: Math.round((fun.need_identified / callAttempt) * 10000) / 100,
    opportunity_rate: Math.round((fun.opportunity / callAttempt) * 10000) / 100,
    quotation_rate: Math.round((fun.quotation / callAttempt) * 10000) / 100,
    order_rate: Math.round((fun.orders / callAttempt) * 10000) / 100,
  };

  // Productivity Efficiencies
  const productivity = {
    pic_conversion_efficiency: Math.round((fun.pic_identified / connected) * 10000) / 100,
    opportunity_efficiency: Math.round((fun.opportunity / picConv) * 10000) / 100,
    revenue_efficiency: Math.round((Number(bus.revenue) / callAttempt) * 100) / 100,
  };

  return {
    period,
    sales_id: salesId ?? null,
    activity: act,
    quality: {
      call_quality: Number(qual.call_quality ?? 0),
      wa_quality: Number(qual.wa_quality ?? 0),
    },
    conversion_rates: conversions,
    business: bus,
    productivity,
  };
}

// ── Role-Based Dashboards ───────────────────────────────────────────────────

export async function getManagementDashboard() {
  const kpis = await getSalesKPIs(undefined, 'monthly');
  const salesCountRes = await pool.query("SELECT COUNT(*)::int FROM trainer_employees WHERE status = 'active'");
  const avgCompRes = await pool.query('SELECT ROUND(AVG(overall_score), 2) AS avg_comp FROM trainer_evaluations');
  const trainingEffRes = await pool.query('SELECT ROUND(AVG(overall_effectiveness), 2) AS avg_eff FROM trainer_effectiveness_evaluations');

  return {
    dashboard_type: 'management',
    total_sales: salesCountRes.rows[0]?.avg_comp ?? 0,
    average_competency: Number(avgCompRes.rows[0]?.avg_comp ?? 0),
    training_effectiveness: Number(trainingEffRes.rows[0]?.avg_eff ?? 0),
    ...kpis,
  };
}

export async function getSalesManagerDashboard() {
  const kpis = await getSalesKPIs(undefined, 'monthly');
  const teamCompRes = await pool.query('SELECT competency, ROUND(AVG(current_score), 2) AS avg_score FROM trainer_tna_results GROUP BY competency');
  const weakRes = await pool.query('SELECT competency, AVG(gap) AS avg_gap FROM trainer_tna_results GROUP BY competency ORDER BY avg_gap DESC LIMIT 3');
  const coachingCountRes = await pool.query("SELECT COUNT(*)::int FROM trainer_coaching_logs WHERE status != 'CLOSED'");

  return {
    dashboard_type: 'sales_manager',
    team_competency_breakdown: teamCompRes.rows,
    team_weaknesses: weakRes.rows.map((r) => r.competency),
    active_coaching_logs: coachingCountRes.rows[0]?.count ?? 0,
    ...kpis,
  };
}

export async function getSalesIndividualDashboard(salesId: number) {
  const kpis = await getSalesKPIs(salesId, 'monthly');
  const empRes = await pool.query('SELECT * FROM trainer_employees WHERE id = $1 OR user_id = $1', [salesId]);
  const tnaRes = await pool.query('SELECT * FROM trainer_tna_results WHERE sales_id = $1 ORDER BY priority_score DESC', [salesId]);
  const assRes = await pool.query('SELECT * FROM trainer_assessments WHERE sales_id = $1 ORDER BY id DESC', [salesId]);
  const coachRes = await pool.query('SELECT * FROM trainer_coaching_logs WHERE employee_id = $1 ORDER BY id DESC', [salesId]);

  return {
    dashboard_type: 'individual_sales',
    employee: empRes.rows[0] ?? null,
    kpis,
    tna_priorities: tnaRes.rows,
    assessments: assRes.rows,
    coaching_logs: coachRes.rows,
  };
}

// ── Reporting & Export ───────────────────────────────────────────────────────

export async function exportReportCSV(period: 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'annual' = 'monthly') {
  const kpi = await getSalesKPIs(undefined, period);
  const rows = [
    ['Metric Category', 'Metric Name', 'Value'],
    ['Activity', 'Call Attempts', kpi.activity.call_attempt],
    ['Activity', 'Connected Calls', kpi.activity.connected],
    ['Activity', 'WhatsApp Sent', kpi.activity.wa_sent],
    ['Activity', 'Follow-ups', kpi.activity.follow_up],
    ['Quality', 'Call Quality Score', kpi.quality.call_quality],
    ['Quality', 'WhatsApp Quality Score', kpi.quality.wa_quality],
    ['Conversion', 'Gatekeeper Pass Rate (%)', kpi.conversion_rates.gatekeeper_pass_rate],
    ['Conversion', 'Order Rate (%)', kpi.conversion_rates.order_rate],
    ['Business', 'Total Revenue', kpi.business.revenue],
    ['Business', 'Gross Profit', kpi.business.gross_profit],
    ['Productivity', 'Revenue Efficiency', kpi.productivity.revenue_efficiency],
  ];

  return rows.map((r) => r.join(',')).join('\n');
}
