/**
 * bulk-embed-cohere.mjs
 * Embeds all NULL memories using Cohere embed-english-v3.0
 * Free trial: 2,000 inputs/min — no credit card needed
 * Run: node scripts/bulk-embed-cohere.mjs
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { createClient } from '@supabase/supabase-js';

// Load .env.local
const envPath = resolve(process.cwd(), '.env.local');
const envVars = {};
try {
  readFileSync(envPath, 'utf8').split('\n').forEach(line => {
    const [k, ...v] = line.split('=');
    if (k && v.length) envVars[k.trim()] = v.join('=').trim().replace(/^"|"$/g, '');
  });
} catch {}

const SUPABASE_URL  = envVars.NEXT_PUBLIC_SUPABASE_URL  || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY   = envVars.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
const COHERE_KEY    = envVars.COHERE_API_KEY            || process.env.COHERE_API_KEY;
const USER_ID       = '4d2f3e3c-b834-43fc-852a-c3cdbb535b68';
const BATCH_SIZE    = 50;  // Cohere allows up to 96 per request
const COHERE_MODEL  = 'embed-english-v3.0'; // 1024 dims — free trial

if (!COHERE_KEY) {
  console.error('❌ COHERE_API_KEY not found in .env.local');
  console.error('   Get a free key at https://cohere.com → Dashboard → API Keys');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

async function getCohereEmbeddings(texts) {
  const res = await fetch('https://api.cohere.com/v2/embed', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${COHERE_KEY}`,
    },
    body: JSON.stringify({
      model: COHERE_MODEL,
      texts,
      input_type: 'search_document',
      embedding_types: ['float'],
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Cohere ${res.status}: ${err}`);
  }

  const body = await res.json();
  return body.embeddings.float;
}

async function main() {
  console.log('🧠 EYES Bulk Embedder — Cohere embed-english-v3.0 (1024 dims)');
  console.log('────────────────────────────────────────────────────────────────');

  const { count: total } = await supabase
    .from('memories')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', USER_ID)
    .is('embedding', null)
    .not('content', 'is', null);

  console.log(`📦 Memories to embed: ${total ?? 0}`);
  if (!total) { console.log('✅ All memories already embedded!'); return; }

  const estSecs = Math.ceil((total / BATCH_SIZE) * 2);
  console.log(`⏱  Estimated time: ~${estSecs} seconds\n`);

  let processed = 0;
  let errors = 0;

  while (true) {
    const { data: memories, error } = await supabase
      .from('memories')
      .select('id, title, content')
      .eq('user_id', USER_ID)
      .is('embedding', null)
      .not('content', 'is', null)
      .limit(BATCH_SIZE);

    if (error) { console.error('Fetch error:', error.message); break; }
    if (!memories || memories.length === 0) break;

    const texts = memories.map(m =>
      [m.title, m.content].filter(Boolean).join('\n').slice(0, 4096)
    );

    try {
      const embeddings = await getCohereEmbeddings(texts);

      for (let i = 0; i < memories.length; i++) {
        const { error: upErr } = await supabase
          .from('memories')
          .update({ embedding: embeddings[i] })
          .eq('id', memories[i].id)
          .eq('user_id', USER_ID);

        if (upErr) { errors++; continue; }
        processed++;
      }

      process.stdout.write(`\r  ✓ ${processed}/${total} embedded  (${errors} errors)`);

    } catch (err) {
      if (err.message.includes('429')) {
        console.log('\n⏳ Rate limited — waiting 30s...');
        await new Promise(r => setTimeout(r, 30000));
        continue;
      }
      console.error('\n❌ Cohere error:', err.message);
      break;
    }

    // 500ms pause between batches — well within 2000 inputs/min
    await new Promise(r => setTimeout(r, 500));
  }

  console.log(`\n\n✅ Done! Embedded: ${processed} | Errors: ${errors}`);
}

main().catch(e => { console.error('Fatal:', e.message); process.exit(1); });
