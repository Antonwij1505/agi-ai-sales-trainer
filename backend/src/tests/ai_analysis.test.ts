import assert from 'assert';
import {
  MockAIService,
  applyHumanReviewOverride,
  executeCallAnalysis,
  executeWhatsAppAnalysis,
  setAIServiceProvider,
} from '../services/ai_engine.service.js';
import { createCall, createCustomer, createWhatsAppConversation } from '../services/crm.service.js';

async function runTests() {
  console.log('Running AI Analysis Engine tests (Task 04)...');

  const mockAI = new MockAIService();
  setAIServiceProvider(mockAI);

  // Setup DB fixture
  const custCode = `CUST-AI-${Date.now()}`;
  const cust = await createCustomer({
    customer_code: custCode,
    name: 'AI Analysis Test Customer',
    type: 'B2G',
    organization: 'Dinas Pariwisata',
    contact: { phone: '0811111111' },
    status: 'active',
    funnel_stage: 'TARGET',
  });

  const call = await createCall({
    sales_id: 1,
    customer_id: cust.id,
    duration_seconds: 120,
    transcript: 'Sales: Selamat pagi dengan Mbak Dewi di Dinas Pariwisata? Mbak, boleh minta nomor Pak Kabid? Gatekeeper: Maaf Pak, harus bersurat dulu.',
    funnel_stage: 'GATEKEEPER',
    outcome: 'Gatekeeper refused',
  });

  const wa = await createWhatsAppConversation({
    sales_id: 1,
    customer_id: cust.id,
    messages: [{ sender: 'sales', message: 'Selamat siang Pak' }],
    outcome: 'Sent greeting',
  });

  // 1. Test Valid Call Analysis Execution
  mockAI.setConfidence(0.85);
  const callAnalysis = await executeCallAnalysis(call.id);
  assert.strictEqual(callAnalysis.status, 'COMPLETED');
  assert.strictEqual(callAnalysis.overall_score, 76);
  assert(callAnalysis.analysis_payload.competencies.length === 9);
  console.log('✅ Valid Call AI analysis execution verified');

  // 2. Test Low Confidence triggers NEEDS_HUMAN_REVIEW
  mockAI.setConfidence(0.55); // < 0.70 threshold
  const callAnalysisLowConf = await executeCallAnalysis(call.id);
  assert.strictEqual(callAnalysisLowConf.status, 'NEEDS_HUMAN_REVIEW');
  console.log('✅ Low confidence (<0.7) triggers NEEDS_HUMAN_REVIEW status');

  // 3. Test Human Review Override
  const overridden = await applyHumanReviewOverride(callAnalysisLowConf.id, {
    reviewed_by: 'supervisor_danar',
    override_overall_score: 82,
    manager_notes: 'Sales actually explained RUP context adequately after gatekeeper objection',
  });
  assert.strictEqual(overridden.status, 'OVERRIDDEN');
  assert.strictEqual(overridden.overall_score, 82);
  assert.strictEqual(overridden.human_review.reviewed_by, 'supervisor_danar');
  console.log('✅ Human review override verified');

  // 4. Test WhatsApp Analysis Execution
  mockAI.setConfidence(0.9);
  const waAnalysis = await executeWhatsAppAnalysis(wa.id);
  assert.strictEqual(waAnalysis.status, 'COMPLETED');
  assert.strictEqual(waAnalysis.overall_score, 79);
  console.log('✅ Valid WhatsApp AI analysis execution verified');

  // 5. Test Error Handling: Timeout
  mockAI.setFailTimeout(true);
  let timeoutCaught = false;
  try {
    await executeCallAnalysis(call.id);
  } catch {
    timeoutCaught = true;
  }
  assert(timeoutCaught, 'Timeout error should be caught and thrown');
  mockAI.setFailTimeout(false);
  console.log('✅ AI timeout handling verified');

  // 6. Test Error Handling: Malformed JSON
  mockAI.setReturnMalformed(true);
  let malformedCaught = false;
  try {
    await executeCallAnalysis(call.id);
  } catch {
    malformedCaught = true;
  }
  assert(malformedCaught, 'Malformed JSON error should be caught and thrown');
  mockAI.setReturnMalformed(false);
  console.log('✅ Malformed JSON handling verified');

  // 7. Test Error Handling: Invalid Schema Output
  mockAI.setReturnInvalid(true);
  let invalidCaught = false;
  try {
    await executeCallAnalysis(call.id);
  } catch {
    invalidCaught = true;
  }
  assert(invalidCaught, 'Invalid schema output should be caught and thrown');
  mockAI.setReturnInvalid(false);
  console.log('✅ Invalid schema output validation verified');

  console.log('All AI Analysis Engine tests passed successfully!');
}

runTests().catch((err) => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
