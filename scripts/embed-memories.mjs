/**
 * Diagnostic script: tests if generateEmbedding is working and then
 * re-embeds all memories that currently have NULL embedding vectors.
 *
 * Usage: node scripts/embed-memories.mjs
 */

import { createClient } from '@supabase/supabase-js';
import { GoogleGenerativeAI, TaskType } from '@google/generative-ai';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(__dirname, '../.env.local');
const envContent = readFileSync(envPath, 'utf-8');
const env = Object.fromEntries(
  envContent.split('\n')
    .filter(line => line.trim() && !line.startsWith('#'))
    .map(line => {
      const idx = line.indexOf('=');
      if (idx === -1) return null;
      const key = line.slice(0, idx).trim();
      let val = line.slice(idx + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      return [key, val];
    })
    .filter(Boolean)
);

const SUPABASE_URL  = env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY   = env.SUPABASE_SERVICE_ROLE_KEY;
const GEMINI_KEY    = env.GEMINI_API_KEY;
const OPENAI_KEY    = env.OPENAI_API_KEY;

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false }
});

// ── Step 1: Test embedding API ────────────────────────────────────────────────
console.log('\n🔬 Testing embedding APIs...');

async function embedWithGemini(text) {
  const genAI = new GoogleGenerativeAI(GEMINI_KEY);
  const model = genAI.getGenerativeModel({ model: 'gemini-embedding-001' });
  const result = await model.embedContent({
    content: { role: 'user', parts: [{ text: text.slice(0, 8000) }] },
    taskType: TaskType.RETRIEVAL_DOCUMENT,
  });
  return Array.from(result.embedding.values);
}

let useGemini = false;

try {
  const vec = await embedWithGemini('test embedding');
  console.log(`  ✅ Gemini embedding-001: OK (dims=${vec.length})`);
  useGemini = true;
} catch (err) {
  console.log(`  ❌ Gemini FAILED: ${err.message}`);
}

if (!useGemini) {
  console.error('\n❌ Gemini API unavailable. The free tier quota (1000 req/day) may be exhausted.');
  console.error('   Wait for the daily quota to reset (Pacific midnight), then re-run this script.');
  process.exit(1);
}

async function embed(text) {
  return embedWithGemini(text);
}

// ── Step 2: Find all rows with NULL embedding ─────────────────────────────────
const { count } = await supabase
  .from('memories')
  .select('id', { count: 'exact', head: true })
  .is('embedding', null);

console.log(`\n📊 Found ${count} memories with NULL embedding (need vectorizing)\n`);

if (!count || count === 0) {
  console.log('✅ All memories already have embeddings. Nothing to do.');
  process.exit(0);
}

// ── Step 3: Process in pages of 50 ───────────────────────────────────────────
const PAGE_SIZE = 50;
let processed = 0;
let succeeded = 0;
let failed = 0;
let offset = 0;

while (offset < count) {
  const { data: rows, error } = await supabase
    .from('memories')
    .select('id, platform, title, content, event_type')
    .is('embedding', null)
    .range(offset, offset + PAGE_SIZE - 1);

  if (error || !rows || rows.length === 0) break;

  console.log(`Processing batch ${Math.floor(offset / PAGE_SIZE) + 1}: rows ${offset + 1}–${offset + rows.length}`);

  for (const row of rows) {
    try {
      // Build the embed text (same format as memories.ts)
      const header = [
        `[Source: ${row.platform}]`,
        row.event_type ? `[Type: ${row.event_type}]` : null,
        row.title ? `Title: ${row.title}` : null,
      ].filter(Boolean).join(' ');

      const text = `${header}\n\n${(row.content || '').trim().slice(0, 8000)}`;
      const embedding = await embed(text);

      if (!embedding) {
        failed++;
        continue;
      }

      const { error: updateError } = await supabase
        .from('memories')
        .update({ embedding })
        .eq('id', row.id);

      if (updateError) {
        console.warn(`  ⚠️  Update failed for ${row.id}: ${updateError.message}`);
        failed++;
      } else {
        succeeded++;
      }
    } catch (err) {
      console.error(`  ❌ Error on row ${row.id}:`, err.message);
      failed++;
    }

    processed++;
    if (processed % 10 === 0) {
      process.stdout.write(`  ✅ ${processed}/${count} done (${succeeded} embedded, ${failed} failed)\r`);
    }

    // Respect rate limits
    await new Promise(r => setTimeout(r, 120));
  }

  offset += rows.length;
  console.log(`\n  Batch done. Progress: ${succeeded} embedded, ${failed} failed.`);
  await new Promise(r => setTimeout(r, 500));
}

console.log(`\n\n✅ Embedding complete!`);
console.log(`   Total processed : ${processed}`);
console.log(`   Successfully embedded : ${succeeded}`);
console.log(`   Failed : ${failed}`);
console.log('\nRun this SQL in Supabase to verify:');
console.log("SELECT platform, COUNT(*), COUNT(embedding) as with_vectors FROM memories GROUP BY platform;");
