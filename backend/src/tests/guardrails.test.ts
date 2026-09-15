/**
 * Guardrail tests for the deterministic parts of the pipeline.
 *
 * These run WITHOUT calling an LLM: the whole point of moving state and score
 * arithmetic to the server is that they become testable and injection-proof.
 *
 * Run: npx tsx src/tests/guardrails.test.ts
 */

import assert from 'node:assert/strict';

import { computeWeightedScore, type RubricCriterion } from '../services/evaluation.service.js';
import {
  deriveState,
  isConversationDone,
  nextResistance,
  sanitizeCustomerReply,
} from '../services/roleplay.service.js';
import { extractJsonObject } from '../services/llm.service.js';
import { render } from '../services/prompt.service.js';

let passed = 0;
let failed = 0;

function test(name: string, fn: () => void): void {
  try {
    fn();
    passed += 1;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    failed += 1;
    console.error(`  ✗ ${name}`);
    console.error(`      ${(err as Error).message}`);
  }
}

const rubric: RubricCriterion[] = [
  { competency: 'gatekeeper_handling', weight: 30, criteria: null, scoring_instruction: null, version: 1 },
  { competency: 'discovery_probing', weight: 20, criteria: null, scoring_instruction: null, version: 1 },
  { competency: 'opening_credibility', weight: 15, criteria: null, scoring_instruction: null, version: 1 },
];

console.log('\nSCORE ARITHMETIC (server recomputes; model arithmetic never trusted)');

test('weighted total uses rubric weights, not model claims', () => {
  // Model says only one competency, score 100. The other two must count as 0.
  // Weights 30+20+15 = 65, so 100 * 30/65 = 46.15 -> 46.
  const { total } = computeWeightedScore(rubric, [{ competency: 'gatekeeper_handling', score: 100 }]);
  assert.equal(total, 46, `expected 46, got ${total}`);
});

test('a competency the model invented is ignored', () => {
  const scored = rubric.map((r) => ({ competency: r.competency, score: 100 }));
  scored.push({ competency: 'made_up_competency', score: 100 });
  const { total } = computeWeightedScore(rubric, scored);
  assert.equal(total, 100);
});

test('perfect partial scores average by weight', () => {
  const { total } = computeWeightedScore(rubric, [
    { competency: 'gatekeeper_handling', score: 50 },
    { competency: 'discovery_probing', score: 100 },
    { competency: 'opening_credibility', score: 0 },
  ]);
  // (50*30 + 100*20 + 0*15) / 65 = 3500/65 = 53.8 -> 54
  assert.equal(total, 54);
});

test('empty rubric yields 0 instead of dividing by zero', () => {
  const { total } = computeWeightedScore([], [{ competency: 'x', score: 100 }]);
  assert.equal(total, 0);
});

console.log('\nRESISTANCE STATE MACHINE (bounded 1..5, deterministic)');

test('polite/objective language softens resistance by 1', () => {
  assert.equal(nextResistance(4, 'Boleh saya minta nomor kontak PIC pengadaan?'), 3);
});

test('pressuring language hardens resistance by 1', () => {
  assert.equal(nextResistance(3, 'Pokoknya harus sambungkan sekarang juga'), 4);
});

test('neutral language leaves resistance unchanged', () => {
  assert.equal(nextResistance(3, 'Halo'), 3);
});

test('resistance never leaves 1..5', () => {
  assert.equal(nextResistance(5, 'pokoknya harus sekarang'), 5);
  assert.equal(nextResistance(1, 'mohon bantuan bapak, terima kasih'), 1);
});

test('state label reflects the customer stance only', () => {
  assert.equal(deriveState(5), 'refusing');
  assert.equal(deriveState(4), 'resistant');
  assert.equal(deriveState(3), 'screening');
  assert.equal(deriveState(2), 'softening');
  assert.equal(deriveState(1), 'cooperative');
});

test('conversation closes only when softened with enough turns', () => {
  assert.equal(isConversationDone(2, 'halo', 3), false, 'too early to close');
  assert.equal(isConversationDone(2, 'halo', 7), true, 'softened + enough turns');
  assert.equal(isConversationDone(5, 'halo', 20), false, 'never closes while hostile');
});

console.log('\nOUTPUT SANITISER (a chat model must not break character)');

test('strips markdown headings and bullets', () => {
  const raw = '## Analisis Opening\n\n- Salam bagus\n- Nada sopan';
  const out = sanitizeCustomerReply(raw);
  assert.ok(!out.includes('#'), `heading survived: ${out}`);
  assert.ok(!out.includes('- '), `bullet survived: ${out}`);
});

test('unwraps a JSON envelope the model produced anyway', () => {
  const out = sanitizeCustomerReply('{"reply": "Ada keperluan apa ya, Pak?", "resistance": 4}');
  assert.equal(out, 'Ada keperluan apa ya, Pak?');
});

test('removes a leading role label and wrapping quotes', () => {
  assert.equal(sanitizeCustomerReply('CS: "Ada apa ya?"'), 'Ada apa ya?');
});

test('strips inline markdown emphasis', () => {
  assert.equal(sanitizeCustomerReply('Ini **penting** ya'), 'Ini penting ya');
});

console.log('\nJSON EXTRACTION (tolerant of fences and prose)');

test('parses a bare object', () => {
  assert.deepEqual(extractJsonObject('{"a":1}'), { a: 1 });
});

test('parses through a ```json fence', () => {
  assert.deepEqual(extractJsonObject('```json\n{"a":2}\n```'), { a: 2 });
});

test('parses when surrounded by prose', () => {
  assert.deepEqual(extractJsonObject('Hasilnya: {"a":3} — selesai'), { a: 3 });
});

test('throws when no object is present', () => {
  assert.throws(() => extractJsonObject('tidak ada json di sini'));
});

console.log('\nPROMPT RENDERING (unknown placeholders stay visible)');

test('fills known placeholders', () => {
  assert.equal(render('Halo {{name}}', { name: 'Sari' }), 'Halo Sari');
});

test('leaves unknown placeholders untouched so typos are visible', () => {
  assert.equal(render('Halo {{nmae}}', { name: 'Sari' }), 'Halo {{nmae}}');
});

test('tolerates whitespace inside the braces', () => {
  assert.equal(render('Halo {{  name  }}', { name: 'Sari' }), 'Halo Sari');
});

console.log(`\n${'='.repeat(56)}`);
console.log(`PASSED: ${passed}   FAILED: ${failed}`);
console.log('='.repeat(56));

if (failed > 0) process.exit(1);
