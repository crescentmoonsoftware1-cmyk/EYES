/**
 * bulk-embed-gemini.mjs
 * Uses @supabase/supabase-js + Gemini embeddings to index all NULL memories.
 * 15 RPM safe rate — 1 item every 4 seconds.
 * Run: node scripts/bulk-embed-gemini.mjs
 */
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://rwywnbkvbztzosvbmrqw.supabase.co';
const SERVICE_KEY  = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJ3eXduYmt2Ynp0em9zdmJtcnF3Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NTcyNzkzNiwiZXhwIjoyMDkxMzAzOTM2fQ.n3Ybhin5uIvUA5WJa5r9xh9sZB1v4S916a8gb9bJf50';
const GEMINI_KEY   = 'AIzaSyD3dCq5UC8VVvvb-9V7sjSc3UP92rry5SA';
const USER_ID      = '4d2f3e3c-b834-43fc-852a-c3cdbb535b68';
const DELAY_MS     = 4000;   // 4s gap = 15 RPM, under Gemini's 20 RPM free limit
const EMBED_MODEL  = 'gemini-embedding-001';
const EMBED_DIMS   = 1024;

const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

async function getGeminiEmbedding(text) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${EMBED_MODEL}:embedContent?key=${GEMINI_KEY}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: `models/${EMBED_MODEL}`,
      content: { parts: [{ text: text.slice(0, 8000) }] },
      outputDimensionality: EMBED_DIMS,
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Gemini ${res.status}: ${err}`);
  }
  const body = await res.json();
  return body.embedding?.values ?? null;
}

async function main() {
  console.log('🧠 EYES Bulk Embedder — Gemini (15 RPM safe mode)');
  console.log('───────────────────────────────────────────────────');

  // Count total pending
  const { count: total } = await supabase
    .from('memories')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', USER_ID)
    .is('embedding', null)
    .not('content', 'is', null);

  console.log(`📦 Memories to embed: ${total ?? 0}`);
  if (!total) { console.log('✅ All memories already embedded!'); return; }

  const estMins = Math.ceil((total * DELAY_MS) / 60000);
  console.log(`⏱  Estimated time: ~${estMins} minutes\n`);

  let processed = 0;
  let errors    = 0;

  while (true) {
    // Fetch next batch of 50 un-embedded
    const { data: memories, error } = await supabase
      .from('memories')
      .select('id, title, content')
      .eq('user_id', USER_ID)
      .is('embedding', null)
      .not('content', 'is', null)
      .limit(50);

    if (error) { console.error('Fetch error:', error.message); break; }
    if (!memories || memories.length === 0) break;

    for (const mem of memories) {
      const text = [mem.title, mem.content].filter(Boolean).join('\n');

      try {
        const embedding = await getGeminiEmbedding(text);
        if (!embedding) { errors++; continue; }

        const { error: upErr } = await supabase
          .from('memories')
          .update({ embedding })
          .eq('id', mem.id)
          .eq('user_id', USER_ID);

        if (upErr) { errors++; console.error(`\n  Update failed ${mem.id}:`, upErr.message); continue; }

        processed++;
        process.stdout.write(`\r  ✓ ${processed}/${total} embedded  (${errors} errors)`);

      } catch (err) {
        if (err.message.includes('429')) {
          console.log('\n⏳ Gemini quota hit — waiting 65s...');
          await new Promise(r => setTimeout(r, 65000));
          // retry once
          try {
            const emb = await getGeminiEmbedding(text);
            if (emb) {
              await supabase.from('memories').update({ embedding: emb }).eq('id', mem.id);
              processed++;
            } else errors++;
          } catch (_) { errors++; }
        } else {
          errors++;
          console.error(`\n  ✗ ${mem.id}: ${err.message}`);
        }
      }

      await new Promise(r => setTimeout(r, DELAY_MS));
    }
  }

  console.log(`\n\n✅ Finished! Embedded: ${processed} | Errors: ${errors}`);
}

main().catch(e => { console.error('Fatal:', e.message); process.exit(1); });
