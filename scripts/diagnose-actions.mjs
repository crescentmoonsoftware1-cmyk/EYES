/**
 * diagnose-actions.mjs
 * Checks action_queue, memory platform names, and extraction log.
 * Usage: node scripts/diagnose-actions.mjs
 */

import * as dotenv from 'dotenv';
import { resolve } from 'path';
import { createClient } from '@supabase/supabase-js';

dotenv.config({ path: resolve(process.cwd(), '.env.local') });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function run() {
  console.log('\n=== EYES Action Queue Diagnostics ===\n');

  // ── 1. action_queue rows ─────────────────────────────────────────────────
  console.log('📋 CHECK 1: action_queue table');
  const { data: actions, error: aErr } = await supabase
    .from('action_queue')
    .select('id, user_id, platform, title, status, confidence, extracted_at')
    .order('extracted_at', { ascending: false })
    .limit(10);

  if (aErr) {
    console.log('  ❌ Error querying action_queue:', aErr.message);
  } else if (!actions || actions.length === 0) {
    console.log('  ⚠️  action_queue is EMPTY — no actions were inserted.');
  } else {
    console.log(`  ✅ ${actions.length} row(s) found:`);
    actions.forEach(a => console.log(`     [${a.status}] ${a.platform} | ${a.title} | ${a.confidence}% | ${a.extracted_at}`));
  }

  // ── 2. Platform names in memories ────────────────────────────────────────
  console.log('\n📋 CHECK 2: Platform names in memories table');
  const { data: memRows, error: mErr } = await supabase
    .from('memories')
    .select('platform')
    .limit(2000);

  if (mErr) {
    console.log('  ❌ Error querying memories:', mErr.message);
  } else {
    const counts = {};
    (memRows || []).forEach(r => { counts[r.platform] = (counts[r.platform] || 0) + 1; });
    const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
    console.log(`  Found ${sorted.length} distinct platforms:`);

    const ACTIONABLE = ['gmail', 'google-calendar', 'github', 'linear', 'trello', 'slack', 'notion', 'discord'];
    sorted.forEach(([p, count]) => {
      const match = ACTIONABLE.includes(p) ? '✅ actionable' : '⬜ filtered out';
      console.log(`     ${match} | "${p}" (${count} memories)`);
    });

    // Check for near-misses
    const possibleMismatches = sorted
      .map(([p]) => p)
      .filter(p => !ACTIONABLE.includes(p) && ACTIONABLE.some(a =>
        a.replace(/-/g,'_') === p || a.replace(/_/g,'-') === p || a.toLowerCase() === p.toLowerCase()
      ));
    if (possibleMismatches.length > 0) {
      console.log(`\n  ⚠️  MISMATCH — these are close but not matching the ACTIONABLE list:`);
      possibleMismatches.forEach(p => console.log(`     DB has: "${p}"`));
    }
  }

  // ── 3. action_extraction_log ─────────────────────────────────────────────
  console.log('\n📋 CHECK 3: action_extraction_log');
  const { data: logs, error: lErr } = await supabase
    .from('action_extraction_log')
    .select('user_id, last_run_at, memory_count')
    .order('last_run_at', { ascending: false })
    .limit(5);

  if (lErr) {
    console.log('  ❌ Error querying action_extraction_log:', lErr.message);
  } else if (!logs || logs.length === 0) {
    console.log('  ⚠️  action_extraction_log is EMPTY — cron never completed a run.');
  } else {
    console.log(`  ✅ ${logs.length} log row(s):`);
    logs.forEach(l => console.log(`     user=${l.user_id.slice(0,8)}... | last_run=${l.last_run_at} | memory_count=${l.memory_count}`));
  }

  console.log('\n=== Diagnostics complete ===\n');
}

run().catch(console.error);
