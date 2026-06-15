#!/usr/bin/env npx ts-node --project tsconfig.json
/**
 * K4 — Smoke Test Script
 *
 * Usage:
 *   MOCK_MODE=false npx ts-node scripts/smoke-test.ts
 *
 * Verifies: one call per alias, one full conversational turn, one audit dry-run.
 * Prints PASS/FAIL per item. All green = keys are live and wired correctly.
 */

import * as dotenv from 'dotenv';
import * as fs from 'fs';

if (fs.existsSync('.env.local')) dotenv.config({ path: '.env.local' });
else dotenv.config();

const GATEWAY_BASE = (process.env.LITELLM_BASE_URL || '').replace(/\/$/, '');
const GATEWAY_KEY  = process.env.LITELLM_KEY || '';
const SITE_URL     = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';

interface TestResult { id: string; pass: boolean; note?: string; }
const results: TestResult[] = [];

function log(id: string, pass: boolean, note?: string) {
  results.push({ id, pass, note });
  const icon = pass ? '✅' : '❌';
  console.log(`${icon} [${id}] ${note ?? (pass ? 'OK' : 'FAILED')}`);
}

async function gatewayCall(alias: string, prompt: string): Promise<string | null> {
  if (!GATEWAY_BASE || !GATEWAY_KEY) return null;
  const res = await fetch(`${GATEWAY_BASE}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${GATEWAY_KEY}` },
    body: JSON.stringify({
      model: alias,
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 64,
      temperature: 0,
    }),
  });
  if (!res.ok) { console.warn(`  Gateway ${alias} → HTTP ${res.status}`); return null; }
  const body = await res.json();
  return body?.choices?.[0]?.message?.content ?? null;
}

async function testAlias(alias: string) {
  try {
    const text = await gatewayCall(alias, 'Reply with one word: ready');
    log(alias, !!text, text ? `Response: "${text.slice(0, 60)}"` : 'No response');
  } catch (err) {
    log(alias, false, err instanceof Error ? err.message : String(err));
  }
}

async function testEmbed() {
  try {
    if (!GATEWAY_BASE || !GATEWAY_KEY) { log('auto-embed', false, 'LITELLM_BASE_URL or LITELLM_KEY not set'); return; }
    const res = await fetch(`${GATEWAY_BASE}/embeddings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${GATEWAY_KEY}` },
      body: JSON.stringify({ model: 'auto-embed', input: 'smoke test embedding' }),
    });
    if (!res.ok) { log('auto-embed', false, `HTTP ${res.status}`); return; }
    const body = await res.json();
    const vec: number[] = body?.data?.[0]?.embedding;
    log('auto-embed', Array.isArray(vec) && vec.length > 0, `dims=${vec?.length}`);
  } catch (err) {
    log('auto-embed', false, err instanceof Error ? err.message : String(err));
  }
}

async function testConversationalTurn() {
  try {
    const text = await gatewayCall('auto-chat', [
      'You are EYES. The user says: "When did I last email about the incubator?" The evidence block is empty.',
      'Respond in under 30 words, citing absence of data.',
    ].join('\n'));
    const pass = !!text && text.length > 10;
    log('conversational-turn', pass, pass ? `"${text!.slice(0, 80)}"` : 'Empty response');
  } catch (err) {
    log('conversational-turn', false, err instanceof Error ? err.message : String(err));
  }
}

async function testAuditDryRun() {
  try {
    const res = await fetch(`${SITE_URL}/api/audit/create`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dry_run: true }),
    });
    // 200 or 401 (not authenticated) both confirm the route exists and responds
    log('audit-dry-run', res.status < 500, `HTTP ${res.status}`);
  } catch (err) {
    log('audit-dry-run', false, err instanceof Error ? err.message : String(err));
  }
}

async function testMockMode() {
  try {
    const res = await fetch(`${SITE_URL}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: [{ role: 'user', content: 'smoke test' }], mock: true }),
    });
    log('mock-mode-chat', res.status < 500, `HTTP ${res.status}`);
  } catch (err) {
    log('mock-mode-chat', false, err instanceof Error ? err.message : String(err));
  }
}

async function main() {
  console.log('\n══════════════════════════════════════');
  console.log('  EYES — K4 Smoke Test');
  console.log(`  Gateway: ${GATEWAY_BASE || '(not configured)'}`);
  console.log('══════════════════════════════════════\n');

  // One call per alias (K2)
  await testAlias('auto-chat');
  await testAlias('auto-extract');
  await testAlias('auto-classify');
  await testEmbed();

  // Full conversational turn
  await testConversationalTurn();

  // Audit dry-run
  await testAuditDryRun();

  // Mock mode check
  await testMockMode();

  // Summary
  const passed = results.filter(r => r.pass).length;
  const total  = results.length;
  console.log('\n══════════════════════════════════════');
  console.log(`  Result: ${passed}/${total} passed`);
  if (passed === total) {
    console.log('  ✅ ALL GREEN — keys are live, plug-in complete.');
  } else {
    console.log('  ❌ FAILURES DETECTED — see items above.');
    results.filter(r => !r.pass).forEach(r => console.log(`     → ${r.id}: ${r.note}`));
  }
  console.log('══════════════════════════════════════\n');

  process.exit(passed === total ? 0 : 1);
}

main().catch(err => { console.error('Smoke test crashed:', err); process.exit(1); });
