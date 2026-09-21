import assert from 'assert';
import {
  calculateTNAPriorityScore,
  generateIndividualTNA,
  getTeamTNAOverview,
} from '../services/tna.service.js';
import {
  calculateAndSaveEffectiveness,
  calculateEffectivenessCategory,
  createCoachingLog,
  createTrainingModule,
  getRoadmapOverview,
  listCoachingLogs,
  recordAssessment,
} from '../services/training_management.service.js';
import { executeCallAnalysis, setAIServiceProvider, MockAIService } from '../services/ai_engine.service.js';
import { createCall, createCustomer } from '../services/crm.service.js';

async function runTests() {
  console.log('Running Tasks 05 & 06 (TNA, Training Management, Coaching & Effectiveness) tests...');

  // 1. TNA Priority Score Calculation Unit Test
  const prio1 = calculateTNAPriorityScore(25, 3, 5, 4); // high gap, high freq
  assert.strictEqual(prio1.priority_level, 'HIGH');

  const prio2 = calculateTNAPriorityScore(5, 0, 1, 1); // low gap
  assert.strictEqual(prio2.priority_level, 'LOW');
  console.log('✅ TNA priority score calculation & categorization verified');

  // 2. Training Effectiveness Category Unit Test
  assert.strictEqual(calculateEffectivenessCategory(88), 'Highly Effective');
  assert.strictEqual(calculateEffectivenessCategory(74), 'Effective');
  assert.strictEqual(calculateEffectivenessCategory(65), 'Partially Effective');
  assert.strictEqual(calculateEffectivenessCategory(52), 'Ineffective');
  console.log('✅ Training effectiveness categories verified');

  // DB Fixtures & Workflow Tests
  try {
    // Setup Mock AI analysis
    const mockAI = new MockAIService();
    setAIServiceProvider(mockAI);

    const cust = await createCustomer({
      customer_code: `CUST-TNA-${Date.now()}`,
      name: 'TNA Test Customer',
      type: 'B2G',
      organization: 'Dinas Kebudayaan',
      contact: {},
      status: 'active',
      funnel_stage: 'TARGET',
    });

    const call = await createCall({
      sales_id: 14,
      customer_id: cust.id,
      duration_seconds: 150,
      transcript: 'Sales meminta nomor PIC langsung tanpa bina rapport.',
      funnel_stage: 'GATEKEEPER',
      outcome: 'Refused',
    });

    await executeCallAnalysis(call.id);

    // Test Individual TNA
    const indTNA = await generateIndividualTNA(14, 75);
    assert.strictEqual(indTNA.sales_id, 14);
    assert(indTNA.tna.length > 0);

    const gkRes = indTNA.tna.find((t: any) => t.competency.toLowerCase().includes('gatekeeper')) as any;
    assert(gkRes, 'Gatekeeper competency TNA result must exist');
    assert.strictEqual(gkRes.recommended_training, 'Gatekeeper Handling Level 2');
    console.log('✅ Individual TNA generation & recommendation trace verified');

    // Test Team TNA
    const teamTNA = await getTeamTNAOverview();
    assert(teamTNA.overview.length > 0);
    console.log('✅ Team TNA overview & problem categorization verified');

    // Test 12-Month Roadmap
    const roadmap = await getRoadmapOverview();
    assert(roadmap.length >= 12, 'Must have at least 12-month default roadmap');
    console.log('✅ 12-Month default training roadmap verified');

    // Test Training Module Creation
    const mod = await createTrainingModule({
      title: 'Gatekeeper Handling Level 2',
      competency: 'Gatekeeper Handling',
      level: 'Level 2',
      duration_minutes: 90,
      material: 'Panduan menembus gatekeeper B2G',
      quiz: [],
      passing_score: 80,
    });
    assert(mod.id);
    console.log('✅ Training module creation verified');

    // Test Assessment
    const ass = await recordAssessment({
      sales_id: 14,
      catalog_id: mod.id,
      type: 'post-test',
      score: 85,
      feedback: 'Lolos uji pasca latihan',
    });
    assert.strictEqual(ass.passed, true);
    console.log('✅ Assessment recording & passing score verification passed');

    // Test Coaching Log
    const coachLog = await createCoachingLog({
      employee_id: 14,
      coach_id: 1,
      problem: 'Kesulitan saat gatekeeper menolak memberikan nomor PIC',
      evidence: 'Transkrip call ID ' + call.id,
      root_cause: 'Belum membawa data paket RUP spesifik',
      action: 'Simulasi ulang MOD-03 selama 30 menit',
      status: 'OPEN',
    });
    assert(coachLog.id);
    const logs = await listCoachingLogs(14);
    assert(logs.length > 0);
    console.log('✅ Coaching log creation & listing verified');

    // Test Training Effectiveness (Knowledge 30% + Behavior 30% + Business 40%)
    const eff = await calculateAndSaveEffectiveness({
      sales_id: 14,
      catalog_id: mod.id,
      knowledge_improvement: 85, // 85 * 0.3 = 25.5
      behavior_improvement: 80,  // 80 * 0.3 = 24.0
      business_impact_score: 90, // 90 * 0.4 = 36.0 -> Total = 85.5
      evaluation_stage: 'T2',
    });
    assert.strictEqual(Number(eff.overall_effectiveness), 85.5);
    assert.strictEqual(eff.category, 'Highly Effective');
    assert.strictEqual(eff.evaluation_stage, 'T2');
    console.log('✅ Training effectiveness calculation & T0-T5 stage logging verified');
  } catch (err) {
    console.warn('⚠️ DB test execution error:', err);
    throw err;
  }

  console.log('All Tasks 05 & 06 tests passed successfully!');
}

runTests().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
