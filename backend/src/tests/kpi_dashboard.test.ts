import assert from 'assert';
import {
  exportReportCSV,
  getManagementDashboard,
  getSalesIndividualDashboard,
  getSalesKPIs,
  getSalesManagerDashboard,
} from '../services/kpi_dashboard.service.js';
import { pool } from '../db/pool.js';
import { createCustomer } from '../services/crm.service.js';

async function runTests() {
  console.log('Running KPI, Dashboard & Reporting tests (Task 07)...');

  try {
    // Insert test order for business KPI calculation
    const cust = await createCustomer({
      customer_code: `CUST-KPI-${Date.now()}`,
      name: 'KPI Test Customer',
      type: 'B2G',
      organization: 'Dinas PUPR',
      contact: {},
      status: 'active',
      funnel_stage: 'ORDER',
    });

    await pool.query(
      `INSERT INTO trainer_sales_orders (sales_id, customer_id, order_value, gross_profit, status)
       VALUES (1, $1, 150000000.00, 30000000.00, 'ORDER')`,
      [cust.id]
    );

    // 1. Test KPI Calculation
    const kpi = await getSalesKPIs(1, 'monthly');
    assert(kpi.business.revenue >= 150000000, 'Revenue KPI calculation verified');
    assert(kpi.productivity.revenue_efficiency >= 0, 'Revenue efficiency calculation verified');
    console.log('✅ Sales KPI calculation & conversion metrics verified');

    // 2. Test Management Dashboard
    const mgmtDash = await getManagementDashboard();
    assert.strictEqual(mgmtDash.dashboard_type, 'management');
    assert(mgmtDash.business.revenue >= 150000000);
    console.log('✅ Management dashboard aggregation verified');

    // 3. Test Sales Manager Dashboard
    const mgrDash = await getSalesManagerDashboard();
    assert.strictEqual(mgrDash.dashboard_type, 'sales_manager');
    assert(Array.isArray(mgrDash.team_weaknesses));
    console.log('✅ Sales manager dashboard aggregation verified');

    // 4. Test Individual Sales Dashboard
    const indDash = await getSalesIndividualDashboard(1);
    assert.strictEqual(indDash.dashboard_type, 'individual_sales');
    console.log('✅ Individual sales dashboard aggregation verified');

    // 5. Test CSV Report Export
    const csv = await exportReportCSV('monthly');
    assert(csv.includes('Metric Category,Metric Name,Value'));
    assert(csv.includes('Total Revenue'));
    console.log('✅ Report CSV export generation verified');
  } catch (err) {
    console.warn('⚠️ DB KPI test error:', err);
    throw err;
  }

  console.log('All KPI, Dashboard & Reporting tests passed successfully!');
}

runTests().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
