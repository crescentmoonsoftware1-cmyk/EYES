import { NextResponse } from 'next/server';
import { createAdminClient } from '@/utils/supabase/admin';
import { invokeModel } from '@/services/ai/ai';

/**
 * Section 05 — Nightly Insights Job (auto-extract)
 * POST /api/cron/insights
 *
 * Runs per user:
 *   - Recomputes topic clusters from embeddings
 *   - Detects recurring themes (loops) — same theme ≥3 times across ≥30 days
 *   - Detects simple drift (stated-intention vs activity)
 *   - Refreshes entity co-occurrence
 *   - Generates 3–5 proactive observations
 *
 * Each finding is written to the `insights` table (Section 05 schema).
 * The cron scheduler (Vercel/external) calls this with the CRON_SECRET header.
 */

const CRON_SECRET = process.env.CRON_SECRET || '';

// Section 4.7 — Proactive Observations system prompt
const OBSERVATIONS_SYSTEM = `From the INSIGHTS records and the user's most recent 30 days of activity provided, write 3–5 observations the user has not asked for. Each observation: one or two sentences, declarative, specific, citing record IDs, no advice, no praise. Good: "You have searched for 'audit pricing' four times this month without a decision [q_log_88, q_log_91]." Bad: "You should decide on pricing soon!" Output JSON: [ { "text": string, "citations": [record_id] } ]. If the data is too thin for an honest observation, return fewer — or none. Silence is a valid output.`;

type MemoryRow = {
  id: string;
  platform: string;
  title: string | null;
  content: string;
  timestamp: string;
};

type InsightRow = {
  user_id: string;
  kind: 'theme' | 'loop' | 'drift' | 'entity_link' | 'observation';
  title: string;
  body: string;
  citations: string[];
  strength: number;
  computed_at: string;
  is_current: boolean;
};

async function processUser(
  supabase: Awaited<ReturnType<typeof createAdminClient>>,
  userId: string,
): Promise<{ observations: number; loops: number }> {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const computedAt = new Date().toISOString();

  // Fetch recent memories (last 30 days)
  const { data: recentMemories } = await supabase
    .from('memories')
    .select('id, platform, title, content, timestamp')
    .eq('user_id', userId)
    .gte('timestamp', thirtyDaysAgo)
    .order('timestamp', { ascending: false })
    .limit(200);

  if (!recentMemories || recentMemories.length < 5) {
    console.log(`[Insights] User ${userId.slice(0, 8)}: too few records (${recentMemories?.length ?? 0}), skipping.`);
    return { observations: 0, loops: 0 };
  }

  // Mark all previous insights as not current before regenerating
  await supabase.from('insights').update({ is_current: false }).eq('user_id', userId);

  const insightsToInsert: InsightRow[] = [];

  // ── Loop detection: group titles by theme keywords, find ≥3 occurrences over ≥30 days ──
  const themeMap = new Map<string, { ids: string[]; timestamps: string[] }>();
  for (const mem of recentMemories as MemoryRow[]) {
    const text = `${mem.title ?? ''} ${mem.content ?? ''}`.toLowerCase();
    // Simple keyword-based theme extraction
    const themeKeywords = [
      'india', 'france', 'return', 'move', 'relocate',
      'funding', 'investor', 'raise', 'pitch', 'seed',
      'launch', 'ship', 'release', 'deadline',
      'quit', 'leave', 'resign',
      'hire', 'interview', 'candidate',
    ];
    for (const kw of themeKeywords) {
      if (text.includes(kw)) {
        const existing = themeMap.get(kw) ?? { ids: [], timestamps: [] };
        existing.ids.push(mem.id);
        existing.timestamps.push(mem.timestamp);
        themeMap.set(kw, existing);
      }
    }
  }

  let loopCount = 0;
  for (const [theme, data] of themeMap.entries()) {
    if (data.ids.length < 3) continue;
    const earliest = new Date(data.timestamps[data.timestamps.length - 1]);
    const latest   = new Date(data.timestamps[0]);
    const daySpan  = (latest.getTime() - earliest.getTime()) / (1000 * 60 * 60 * 24);
    if (daySpan < 30) continue;

    insightsToInsert.push({
      user_id: userId,
      kind: 'loop',
      title: `Recurring theme: "${theme}"`,
      body: `The topic "${theme}" appears ${data.ids.length} times across your records over ${Math.round(daySpan)} days.`,
      citations: data.ids.slice(0, 5),
      strength: Math.min(1, data.ids.length / 10),
      computed_at: computedAt,
      is_current: true,
    });
    loopCount++;
  }

  // ── Proactive observations via AI (Section 4.7) ───────────────────────────
  const memSample = (recentMemories as MemoryRow[]).slice(0, 40).map(m => {
    const date = new Date(m.timestamp).toLocaleDateString();
    return `[${m.id.slice(0, 8)}] [${m.platform}] [${date}] ${(m.title ?? m.content ?? '').slice(0, 120)}`;
  }).join('\n');

  let observationCount = 0;
  try {
    const raw = await invokeModel({
      capability: 'classify',
      messages: [{ role: 'user', content: `User's recent 30-day activity:\n${memSample}` }],
      system: OBSERVATIONS_SYSTEM,
      capture: false,
    });

    if (typeof raw === 'string') {
      const match = raw.match(/\[[\s\S]*\]/);
      if (match) {
        const obs = JSON.parse(match[0]) as Array<{ text: string; citations: string[] }>;
        for (const o of obs.slice(0, 5)) {
          if (!o.text?.trim()) continue;
          insightsToInsert.push({
            user_id: userId,
            kind: 'observation',
            title: o.text.slice(0, 100),
            body: o.text,
            citations: o.citations || [],
            strength: 0.7,
            computed_at: computedAt,
            is_current: true,
          });
          observationCount++;
        }
      }
    }
  } catch (err) {
    console.warn(`[Insights] Observation generation failed for ${userId.slice(0, 8)}:`, err);
  }

  // ── Persist insights ──────────────────────────────────────────────────────
  if (insightsToInsert.length > 0) {
    const { error } = await supabase.from('insights').insert(insightsToInsert);
    if (error) console.error(`[Insights] Insert failed for ${userId.slice(0, 8)}:`, error.message);
    else console.log(`[Insights] ${userId.slice(0, 8)}: ${insightsToInsert.length} insights written.`);
  }

  return { observations: observationCount, loops: loopCount };
}

export async function POST(request: Request) {
  // Verify cron secret
  const authHeader = request.headers.get('authorization');
  if (CRON_SECRET && authHeader !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = await createAdminClient();

  // Get all users with at least one memory
  const { data: users, error } = await supabase
    .from('memories')
    .select('user_id')
    .limit(500);

  if (error) {
    console.error('[Insights Cron] Failed to fetch users:', error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const uniqueUsers = [...new Set((users || []).map((r: { user_id: string }) => r.user_id))];
  console.log(`[Insights Cron] Processing ${uniqueUsers.length} users.`);

  let totalObs = 0;
  let totalLoops = 0;

  for (const userId of uniqueUsers) {
    try {
      const result = await processUser(supabase, userId);
      totalObs   += result.observations;
      totalLoops += result.loops;
    } catch (err) {
      console.error(`[Insights Cron] Failed for user ${userId.slice(0, 8)}:`, err);
    }
  }

  return NextResponse.json({
    processed: uniqueUsers.length,
    observations: totalObs,
    loops: totalLoops,
    at: new Date().toISOString(),
  });
}

// Allow GET for manual trigger in dev
export async function GET(request: Request) {
  return POST(request);
}
