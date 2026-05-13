import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { invokeModel } from '@/services/ai/ai';

// ── Types ──────────────────────────────────────────────────────────────────
type MemoryRow = {
  id: string;
  platform: string;
  event_type: string | null;
  title: string | null;
  content: string | null;
  is_flagged: boolean | null;
  timestamp: string | null;
};

type TopicCluster = {
  id: string;
  title: string;
  description: string;
  eventIds: string[];
  sentiment: 'positive' | 'neutral' | 'negative';
  connectionCount: number;
  totalEvents: number;
  platforms: string[];
};

type CachedTopic = {
  title: string;
  description: string;
  event_ids: string[];
  sentiment: string;
  connection_count: number;
  updated_at: string;
};

// ── Cache threshold: 6 hours ───────────────────────────────────────────────
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;

// ── Claude-based behavioral pattern clustering ─────────────────────────────
async function buildCognitiveClusters(rows: MemoryRow[]): Promise<TopicCluster[]> {
  if (rows.length < 10) return [];

  // Sample across time range (max 150 memories, spread evenly)
  const step = Math.max(1, Math.floor(rows.length / 150));
  const sampled = rows.filter((_, i) => i % step === 0).slice(0, 150);

  // Build concise memory digest (platform + date + compressed content)
  const digest = sampled.map(r => ({
    id: r.id,
    date: r.timestamp ? new Date(r.timestamp).toISOString().split('T')[0] : 'unknown',
    platform: r.platform,
    text: `${r.title || ''}${r.title && r.content ? ': ' : ''}${(r.content || '').slice(0, 120)}`.trim(),
  }));

  const prompt = `You are analyzing a person's digital activity archive to identify their recurring cognitive and behavioral patterns.

Here are ${digest.length} memory records from across their connected platforms (last 90 days):

${JSON.stringify(digest, null, 0)}

Identify 5 to 8 DISTINCT recurring patterns you see across this data. Look for:
- Recurring work modes (deep focus, planning, collaboration, ideation)
- Recurring emotional or energy states
- Recurring topic obsessions or interest clusters  
- Recurring output patterns (high-output vs. reflection/rest periods)
- Recurring relationship or communication patterns

For each pattern, cite 3-5 specific memory IDs from the data above as evidence.

Return JSON ONLY. No markdown, no explanation. Exact structure:
{
  "patterns": [
    {
      "id": "pattern-1",
      "label": "Short Name (2-4 words)",
      "description": "One precise sentence describing this pattern and what it looks like in the data.",
      "sentiment": "positive",
      "memory_ids": ["uuid1", "uuid2", "uuid3"],
      "platforms": ["github", "gmail"]
    }
  ]
}`;

  const raw = await invokeModel({
    capability: 'chat',
    messages: [{ role: 'user', content: prompt }],
    system: 'You are a behavioral intelligence analyst. Return valid JSON only. No markdown code blocks.',
    preference: 'auto',
  });

  if (!raw) return [];

  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return [];

  const parsed = JSON.parse(jsonMatch[0]) as { patterns?: Array<{
    id: string; label: string; description: string;
    sentiment: string; memory_ids: string[]; platforms: string[];
  }> };

  if (!Array.isArray(parsed.patterns)) return [];

  const idToRow = new Map(rows.map(r => [r.id, r]));

  return parsed.patterns
    .filter(p => p.id && p.label && p.description)
    .map(p => {
      const validIds = (p.memory_ids || []).filter(id => idToRow.has(id));
      const allPlatforms = validIds.length > 0
        ? [...new Set(validIds.map(id => idToRow.get(id)!.platform))]
        : [...new Set(p.platforms || [])];

      return {
        id: p.id,
        title: p.label,
        description: p.description,
        eventIds: validIds,
        sentiment: (['positive', 'neutral', 'negative'].includes(p.sentiment)
          ? p.sentiment : 'neutral') as TopicCluster['sentiment'],
        connectionCount: allPlatforms.length,
        totalEvents: validIds.length || 1,
        platforms: allPlatforms,
      };
    });
}

// ── Fallback: term-frequency grouping (no AI cost) ─────────────────────────
const STOPWORDS = new Set([
  'about','after','again','against','also','because','before','being','between',
  'could','first','from','have','into','just','like','more','most','other','over',
  'should','some','than','that','their','there','these','this','those','through',
  'very','what','when','where','which','while','with','would','your',
]);

function normalizeText(text: string) {
  return text.toLowerCase().replace(/[^a-z0-9\s]+/g, ' ').replace(/\s+/g, ' ').trim();
}
function toTokens(text: string) {
  return normalizeText(text).split(' ').filter(t => t.length >= 4 && !STOPWORDS.has(t));
}
function toSentiment(flagged: number, total: number): TopicCluster['sentiment'] {
  if (total <= 0) return 'neutral';
  const r = flagged / total;
  if (r >= 0.25) return 'negative';
  if (r <= 0.08) return 'positive';
  return 'neutral';
}

function buildFallbackClusters(rows: MemoryRow[]): TopicCluster[] {
  if (rows.length === 0) return [];
  const tokenCounts = new Map<string, number>();
  const rowTextById = new Map<string, string>();
  rows.forEach(r => {
    const text = `${r.title || ''} ${r.content || ''}`.trim();
    rowTextById.set(r.id, normalizeText(text));
    new Set(toTokens(text)).forEach(t => tokenCounts.set(t, (tokenCounts.get(t) ?? 0) + 1));
  });
  const terms = Array.from(tokenCounts.entries())
    .filter(([, c]) => c >= 3).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([t]) => t);
  return terms.flatMap(term => {
    const matching = rows.filter(r => (rowTextById.get(r.id) ?? '').includes(term));
    if (matching.length < 3) return [];
    const platforms = [...new Set(matching.map(r => r.platform))];
    return [{
      id: `term-${term}`,
      title: `${term.charAt(0).toUpperCase()}${term.slice(1)}`,
      description: `${matching.length} memories mention "${term}" across ${platforms.length} source${platforms.length === 1 ? '' : 's'}.`,
      eventIds: matching.map(r => r.id),
      sentiment: toSentiment(matching.filter(r => r.is_flagged).length, matching.length),
      connectionCount: platforms.length,
      totalEvents: matching.length,
      platforms,
    }];
  });
}

// ── Main handler ───────────────────────────────────────────────────────────
export async function GET() {
  try {
    const supabase = await createClient();
    const { data: authData, error: authError } = await supabase.auth.getUser();
    if (authError || !authData.user) return NextResponse.json({ clusters: [] });

    const userId = authData.user.id;

    // 1. Check cache (topics table, < 6 hours old)
    const { data: cached } = await supabase
      .from('topics')
      .select('title,description,event_ids,sentiment,connection_count,updated_at')
      .eq('user_id', userId)
      .order('updated_at', { ascending: false })
      .limit(1);

    if (cached && cached.length > 0) {
      const age = Date.now() - new Date((cached[0] as CachedTopic).updated_at).getTime();
      if (age < CACHE_TTL_MS) {
        // Return all cached clusters
        const { data: allCached } = await supabase
          .from('topics')
          .select('title,description,event_ids,sentiment,connection_count')
          .eq('user_id', userId)
          .order('connection_count', { ascending: false });

        if (allCached && allCached.length > 0) {
          const clusters: TopicCluster[] = (allCached as CachedTopic[]).map((t, i) => ({
            id: `cached-${i}`,
            title: t.title,
            description: t.description,
            eventIds: t.event_ids || [],
            sentiment: (t.sentiment as TopicCluster['sentiment']) || 'neutral',
            connectionCount: t.connection_count || 1,
            totalEvents: (t.event_ids || []).length,
            platforms: [],
          }));
          return NextResponse.json({ clusters, generatedAt: (allCached[0] as CachedTopic & { updated_at: string }).updated_at || new Date().toISOString(), source: 'cache' });
        }
      }
    }

    // 2. Fetch memories for fresh analysis
    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

    const { data, error } = await supabase
      .from('memories')
      .select('id,platform,event_type,title,content,is_flagged,timestamp')
      .eq('user_id', userId)
      .not('content', 'is', null)
      .gte('timestamp', ninetyDaysAgo.toISOString())
      .order('timestamp', { ascending: false })
      .limit(600);

    if (error) throw error;
    const rows = (data ?? []) as MemoryRow[];

    // 3. Try Claude clustering, fall back to term-frequency
    let clusters: TopicCluster[] = [];
    try {
      clusters = await buildCognitiveClusters(rows);
    } catch (aiErr) {
      console.warn('[topic-clusters] Claude clustering failed, using fallback:', aiErr);
    }
    if (clusters.length === 0) {
      clusters = buildFallbackClusters(rows);
    }

    // 4. Persist to topics table (replace existing)
    if (clusters.length > 0) {
      const nowIso = new Date().toISOString();
      await supabase.from('topics').delete().eq('user_id', userId);
      await supabase.from('topics').insert(
        clusters.map(c => ({
          user_id: userId,
          title: c.title,
          description: c.description,
          event_ids: c.eventIds,
          sentiment: c.sentiment,
          connection_count: c.connectionCount,
          created_at: nowIso,
          updated_at: nowIso,
        }))
      );
    }

    return NextResponse.json({ clusters, generatedAt: new Date().toISOString(), source: clusters.length > 0 ? 'claude' : 'fallback' });
  } catch (err) {
    console.error('[topic-clusters] Error:', err);
    return NextResponse.json({ clusters: [] });
  }
}
