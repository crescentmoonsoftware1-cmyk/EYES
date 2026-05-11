import { readFileSync } from 'fs';
import { resolve } from 'path';

// Load .env.local — never hardcode keys in scripts committed to git
const envPath = resolve(process.cwd(), '.env.local');
const envVars = {};
try {
  readFileSync(envPath, 'utf8').split('\n').forEach(line => {
    const [k, ...v] = line.split('=');
    if (k && v.length) envVars[k.trim()] = v.join('=').trim().replace(/^"|"$/g, '');
  });
} catch {}

const SUPABASE_URL   = envVars.NEXT_PUBLIC_SUPABASE_URL   || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY    = envVars.SUPABASE_SERVICE_ROLE_KEY  || process.env.SUPABASE_SERVICE_ROLE_KEY;
const VOYAGE_API_KEY = envVars.VOYAGE_API_KEY             || process.env.VOYAGE_API_KEY;
const USER_ID        = '4d2f3e3c-b834-43fc-852a-c3cdbb535b68';
const BATCH_SIZE     = 8;
const VOYAGE_MODEL   = 'voyage-context-3'; // 200M free tokens

const headers = {
  'apikey': SERVICE_KEY,
  'Authorization': `Bearer ${SERVICE_KEY}`,
  'Content-Type': 'application/json',
};

// ── Supabase helpers ─────────────────────────────────────────────────────────

async function fetchPendingMemories(offset = 0, limit = BATCH_SIZE) {
  const url = `${SUPABASE_URL}/rest/v1/memories?select=id,title,content&user_id=eq.${USER_ID}&embedding=is.null&content=not.is.null&limit=${limit}&offset=${offset}`;
  const res = await fetch(url, { headers: { ...headers, 'Range-Unit': 'items' } });
  if (!res.ok) throw new Error(`Fetch failed: ${res.status} ${await res.text()}`);
  return res.json();
}

async function countPending() {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/memories?select=id&user_id=eq.${USER_ID}&embedding=is.null&content=not.is.null`,
    { headers: { ...headers, 'Prefer': 'count=exact', 'Range': '0-0' } }
  );
  const range = res.headers.get('content-range') || '';
  const total = parseInt(range.split('/')[1] ?? '0', 10);
  return isNaN(total) ? 0 : total;
}

async function updateEmbedding(id, embedding) {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/memories?id=eq.${id}&user_id=eq.${USER_ID}`,
    { method: 'PATCH', headers, body: JSON.stringify({ embedding }) }
  );
  if (!res.ok) throw new Error(`Update failed for ${id}: ${res.status} ${await res.text()}`);
}

// ── Voyage AI embedding (batched) ────────────────────────────────────────────

async function getEmbeddings(texts) {
  const res = await fetch('https://api.voyageai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${VOYAGE_API_KEY}`,
    },
    body: JSON.stringify({ input: texts, model: VOYAGE_MODEL }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Voyage API error ${res.status}: ${err}`);
  }
  const body = await res.json();
  return body.data.map(d => d.embedding);
}

// ── Main loop ────────────────────────────────────────────────────────────────

async function main() {
  console.log('🧠 EYES Bulk Embedder — Voyage AI');
  console.log('──────────────────────────────────');

  const totalPending = await countPending();
  console.log(`📦 Total memories to embed: ${totalPending}`);
  if (totalPending === 0) {
    console.log('✅ Nothing to do — all memories already embedded!');
    return;
  }

  let processed = 0;
  let errors = 0;

  while (true) {
    const memories = await fetchPendingMemories(0, BATCH_SIZE);
    if (!memories.length) break;

    console.log(`\n⚡ Processing batch of ${memories.length} memories... (${processed}/${totalPending} done)`);

    // Build texts
    const texts = memories.map(m =>
      [m.title, m.content].filter(Boolean).join('\n').slice(0, 8000)
    );

    try {
      const embeddings = await getEmbeddings(texts);

      // Update each memory
      for (let i = 0; i < memories.length; i++) {
        try {
          await updateEmbedding(memories[i].id, JSON.stringify(embeddings[i]));
          processed++;
          process.stdout.write(`\r  ✓ ${processed}/${totalPending} embedded`);
        } catch (err) {
          errors++;
          console.error(`\n  ✗ Failed to update memory ${memories[i].id}:`, err.message);
        }
      }
    } catch (err) {
      console.error('\n❌ Voyage batch failed:', err.message);
      if (err.message.includes('429')) {
        console.log('⏳ Rate limited — waiting 60s...');
        await new Promise(r => setTimeout(r, 60000));
        continue;
      }
      break;
    }

    // Pause 22s between batches — stays under 3 RPM free-tier limit
    await new Promise(r => setTimeout(r, 22000));
  }

  console.log(`\n\n✅ Done! Embedded: ${processed} | Errors: ${errors}`);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
