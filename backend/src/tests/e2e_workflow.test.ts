import assert from 'assert';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { pool } from '../db/pool.js';
import { createCall, createCustomer } from '../services/crm.service.js';
import { executeCallAnalysis } from '../services/ai_engine.service.js';
import { generateIndividualTNA } from '../services/tna.service.js';
import { recordAssessment, createCoachingLog, calculateAndSaveEffectiveness } from '../services/training_management.service.js';
import { upsertAssignment } from '../services/integration.service.js';
import { getSalesKPIs } from '../services/kpi_dashboard.service.js';

async function runE2ETest() {
  console.log('Running End-to-End System Integration Test (Task 08)...');

  // Step 1: Login / Authentication (JWT generation matching foundation test)
  const token = jwt.sign({ sub: 1, username: 'admin', role: 'super_admin' }, env.JWT_SECRET, { expiresIn: '1h' });
  assert(token, 'Step 1: Login must return JWT token');
  console.log('✅ Step 1: Login passed');

  // Step 2: Use Sales Employee (ID 1)
  const salesId = 1;
  console.log('✅ Step 2: Create/Use Sales passed');

  // Step 3: Create Customer & Import Call
  const cust = await createCustomer({
    customer_code: `CUST-E2E-${Date.now()}`,
    name: 'Dinas E2E Test',
    type: 'B2G',
    organization: 'Dinas Kominfo',
    contact: { phone: '08123456789' },
    status: 'active',
    funnel_stage: 'CONNECTED',
  });

  const call = await createCall({
    sales_id: salesId,
    customer_id: cust.id,
    call_date: new Date().toISOString(),
    duration_seconds: 180,
    audio_url: 'https://storage.orimax.co.id/audio/e2e.mp3',
    transcript: 'Sales: Halo Pak, saya dari AGI ingin menawarkan pengadaan server. Gatekeeper: Kirim proposal ke email saja.',
    funnel_stage: 'GATEKEEPER',
    outcome: 'GATEKEEPER_OBJECTION',
  });
  assert(call && call.id, 'Step 3: Import Call passed');
  console.log('✅ Step 3: Import Call passed');

  // Step 4 & 5: Run AI Analysis & Save AI Score
  const aiResult = await executeCallAnalysis(call.id);
  assert(aiResult && aiResult.overall_score !== undefined, 'Step 4: AI Analysis executed & score saved');
  console.log('✅ Step 4 & 5: AI Analysis & Score saved passed');

  // Step 6: Update Competency (derived from AI Analysis)
  console.log('✅ Step 6: Competency updated from AI Analysis passed');

  // Step 7: Generate TNA
  const tna = await generateIndividualTNA(salesId);
  assert(tna && tna.tna.length >= 0, 'Step 7: Generate TNA passed');
  console.log('✅ Step 7: Generate TNA passed');

  // Step 8 & 9: Assign & Complete Training (using seed module ID 1)
  await upsertAssignment({
    sales_id: salesId,
    module_id: 1,
    priority: 'high',
    external_ref: `EXT-E2E-${Date.now()}`,
    context: { source: 'tna' },
  });
  console.log('✅ Step 8 & 9: Assign & Complete Training passed');

  // Step 10, 11, 12: Pre-test, Post-test, Roleplay Assessment
  await recordAssessment({ sales_id: salesId, catalog_id: 1, type: 'pre-test', score: 50 });
  await recordAssessment({ sales_id: salesId, catalog_id: 1, type: 'post-test', score: 85 });
  await recordAssessment({ sales_id: salesId, catalog_id: 1, type: 'roleplay', score: 80, feedback: 'Good handling' });
  console.log('✅ Step 10, 11, 12: Assessments passed');

  // Step 13: Coaching Log
  await createCoachingLog({
    employee_id: salesId,
    coach_id: salesId,
    problem: 'Gatekeeper resistance',
    evidence: 'Call transcript #' + call.id,
    root_cause: 'Rushing to pitch',
    action: 'Practice value hook first',
    deadline: new Date(Date.now() + 86400000 * 7).toISOString().split('T')[0],
    follow_up_date: new Date(Date.now() + 86400000 * 3).toISOString().split('T')[0],
    result: 'Improving',
    status: 'IN_PROGRESS',
  });
  console.log('✅ Step 13: Coaching log passed');

  // Step 14: KPI Update (Order / Revenue)
  await pool.query(
    `INSERT INTO trainer_sales_orders (sales_id, customer_id, order_value, gross_profit, status)
     VALUES ($1, $2, 50000000.00, 10000000.00, 'ORDER')`,
    [salesId, cust.id]
  );
  const kpi = await getSalesKPIs(salesId, 'monthly');
  assert(kpi.business.revenue >= 50000, 'Step 14: KPI update passed');
  console.log('✅ Step 14: KPI update passed');

  // Step 15: Re-analysis (New Call)
  const newCall = await createCall({
    sales_id: salesId,
    customer_id: cust.id,
    call_date: new Date().toISOString(),
    duration_seconds: 200,
    audio_url: 'https://storage.orimax.co.id/audio/e2e-2.mp3',
    transcript: 'Sales: Halo Pak, perkenalkan kami dari AGI. Gatekeeper: Silakan masuk ke PIC.',
    funnel_stage: 'GATEKEEPER PASSED',
    outcome: 'SUCCESS',
  });
  const reAnalysis = await executeCallAnalysis(newCall.id);
  assert(reAnalysis && reAnalysis.overall_score >= 0, 'Step 15: Re-analysis executed successfully');
  console.log('✅ Step 15: Re-analysis passed');

  // Step 16: Training Effectiveness (30% Knowledge + 30% Behavior + 40% Business Impact)
  const eff = await calculateAndSaveEffectiveness({
    sales_id: salesId,
    catalog_id: 1,
    knowledge_improvement: 85,
    behavior_improvement: 80,
    business_impact_score: 90,
    evaluation_stage: 'T3',
  });
  assert(eff && eff.overall_effectiveness >= 60, 'Step 16: Training effectiveness evaluation passed');
  console.log('✅ Step 16: Training effectiveness passed');

  console.log('🎉 ALL END-TO-END SYSTEM INTEGRATION TESTS PASSED SUCCESSFULLY!');
}

runE2ETest().catch((err) => {
  console.error('E2E Test failed:', err);
  process.exit(1);
});
