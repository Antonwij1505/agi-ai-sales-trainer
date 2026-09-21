import assert from 'assert';
import {
  FUNNEL_STAGES,
  callSchema,
  createCall,
  createCustomer,
  createWhatsAppConversation,
  customerSchema,
  executeCustomerImport,
  getFunnelStats,
  parseCSV,
  previewAndValidateCustomerImport,
  whatsappSchema,
} from '../services/crm.service.js';
import { pool } from '../db/pool.js';

async function runTests() {
  console.log('Running Call, WhatsApp, Customer, Funnel & Import tests...');

  // 1. Verify 14 Funnel Stages exist in exact order
  const expectedStages = [
    'TARGET',
    'CALL ATTEMPT',
    'CONNECTED',
    'GATEKEEPER',
    'GATEKEEPER PASSED',
    'PIC IDENTIFIED',
    'PIC CONTACT',
    'PIC CONVERSATION',
    'NEED IDENTIFIED',
    'OPPORTUNITY',
    'FOLLOW-UP',
    'QUOTATION',
    'ORDER',
    'REVENUE',
  ];
  assert.strictEqual(FUNNEL_STAGES.length, 14, 'Must have exactly 14 funnel stages');
  expectedStages.forEach((s, idx) => {
    assert.strictEqual(FUNNEL_STAGES[idx], s, `Funnel stage ${idx} must be ${s}`);
  });
  console.log('✅ All 14 sales funnel stages verified');

  // 2. Schema Validations
  const validCust = customerSchema.safeParse({
    customer_code: 'CUST-001',
    name: 'Dinas Kominfo DIY',
    type: 'B2G',
    organization: 'Pemprov DIY',
    contact: { phone: '0274-123456' },
    status: 'active',
    funnel_stage: 'TARGET',
  });
  assert(validCust.success, 'Valid customer schema should pass');

  const invalidCall = callSchema.safeParse({
    sales_id: -1, // invalid negative id
    customer_id: 1,
  });
  assert(!invalidCall.success, 'Invalid sales_id should fail');

  const validWA = whatsappSchema.safeParse({
    sales_id: 1,
    customer_id: 1,
    messages: [{ sender: 'sales', message: 'Selamat siang' }],
  });
  assert(validWA.success, 'Valid WhatsApp schema should pass');
  console.log('✅ Data layer schema validations passed');

  // 3. Test CSV Parser
  const sampleCSV = `customer_code,name,type,organization\nCUST-CSV-01,Dinas Pendidikan,B2G,Pemkab Sleman\nCUST-CSV-02,Dinas Kesehatan,B2G,Pemkot Yogya`;
  const parsedRows = parseCSV(sampleCSV);
  assert.strictEqual(parsedRows.length, 2, 'Should parse 2 CSV rows');
  assert.strictEqual(parsedRows[0]?.customer_code, 'CUST-CSV-01');
  assert.strictEqual(parsedRows[1]?.name, 'Dinas Kesehatan');
  console.log('✅ CSV parser unit test passed');

  // 4. Live DB tests (if DB available)
  try {
    // Customer creation
    const testCode = `TEST-CUST-${Date.now()}`;
    const cust = await createCustomer({
      customer_code: testCode,
      name: 'Test Customer B2G',
      type: 'B2G',
      industry: 'Pemerintahan',
      organization: 'Bappeda',
      contact: { phone: '08123456789' },
      status: 'active',
      funnel_stage: 'TARGET',
    });
    assert(cust.id, 'Customer ID should be generated');
    console.log('✅ Customer creation verified in DB');

    // Duplicate detection on create
    let duplicateCaught = false;
    try {
      await createCustomer({
        customer_code: testCode,
        name: 'Duplicate B2G',
        type: 'B2G',
        status: 'active',
        contact: {},
        funnel_stage: 'TARGET',
      });
    } catch {
      duplicateCaught = true;
    }
    assert(duplicateCaught, 'Duplicate customer code must be rejected');
    console.log('✅ Customer duplicate rejection verified');

    // Call creation with transcript and funnel update
    const call = await createCall({
      sales_id: 1,
      customer_id: cust.id,
      duration_seconds: 180,
      transcript: 'Sales: Selamat pagi. PPK: Ya halo dengan siapa?',
      audio_url: 'https://storage.orimax.co.id/audio/call-01.mp3',
      funnel_stage: 'CONNECTED',
      outcome: 'Connected with PIC',
    });
    assert.strictEqual(call.funnel_stage, 'CONNECTED');
    assert(call.transcript.includes('PPK: Ya halo'));
    console.log('✅ Call & Transcript creation verified');

    // WhatsApp creation
    const wa = await createWhatsAppConversation({
      sales_id: 1,
      customer_id: cust.id,
      messages: [
        { sender: 'sales', message: 'Pak izin kirimkan spesifikasi IFP Orimax' },
        { sender: 'customer', message: 'Silakan kirimkan ke email kami' },
      ],
      outcome: 'Email requested',
    });
    assert(wa.id, 'WhatsApp conversation ID should be generated');
    console.log('✅ WhatsApp conversation verified');

    // Funnel stats
    const stats = await getFunnelStats();
    assert(stats.stages.length === 14);
    assert((stats.counts['CONNECTED'] ?? 0) >= 1);
    console.log('✅ Funnel statistics calculation verified');

    // Import preview & duplicate detection
    const importItems = [
      { customer_code: testCode, name: 'Should be duplicate' },
      { customer_code: `NEW-${Date.now()}`, name: 'Brand New Customer' },
      { customer_code: '', name: 'Missing code' },
    ];
    const preview = await previewAndValidateCustomerImport(importItems);
    assert.strictEqual(preview.preview.length, 3);
    assert.strictEqual(preview.duplicate_count, 1);
    assert.strictEqual(preview.can_import_count, 1);
    assert.strictEqual(preview.invalid_count, 1);
    console.log('✅ Import preview, validation, and duplicate detection verified');
  } catch (err) {
    console.warn('⚠️ DB test failed or skipped:', err);
    throw err;
  }

  console.log('All CRM, Call, WhatsApp & Funnel tests passed successfully!');
}

runTests().catch((err) => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
