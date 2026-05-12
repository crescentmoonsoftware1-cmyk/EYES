import { NextResponse } from 'next/server';

import { createClient } from '@/utils/supabase/server';

type RawEventRow = {
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

const STOPWORDS = new Set([
  'about',
  'after',
  'again',
  'against',
  'also',
  'because',
  'before',
  'being',
  'between',
  'could',
  'first',
  'from',
  'have',
  'into',
  'just',
  'like',
  'more',
  'most',
  'other',
  'over',
  'should',
  'some',
  'than',
  'that',
  'their',
  'there',
  'these',
  'this',
  'those',
  'through',
  'very',
  'what',
  'when',
  'where',
  'which',
  'while',
  'with',
  'would',
  'your',
]);

function normalizeText(text: string) {
  return text.toLowerCase().replace(/[^a-z0-9\s]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function toTokens(text: string) {
  return normalizeText(text)
    .split(' ')
    .filter((token) => token.length >= 4 && !STOPWORDS.has(token));
}

function toSentiment(flaggedCount: number, totalCount: number): 'positive' | 'neutral' | 'negative' {
  if (totalCount <= 0) return 'neutral';
  const ratio = flaggedCount / totalCount;
  if (ratio >= 0.25) return 'negative';
  if (ratio <= 0.08) return 'positive';
  return 'neutral';
}

function toTitle(term: string) {
  if (!term) return 'Untitled Cluster';
  return `${term.charAt(0).toUpperCase()}${term.slice(1)}`;
}

function buildTermClusters(rows: RawEventRow[]): TopicCluster[] {
  if (rows.length === 0) return [];

  const tokenCounts = new Map<string, number>();
  const rowTextById = new Map<string, string>();

  rows.forEach((row) => {
    const text = `${row.title || ''} ${row.content || ''}`.trim();
    rowTextById.set(row.id, normalizeText(text));

    const unique = new Set(toTokens(text));
    unique.forEach((token) => {
      tokenCounts.set(token, (tokenCounts.get(token) ?? 0) + 1);
    });
  });

  const candidateTerms = Array.from(tokenCounts.entries())
    .filter(([, count]) => count >= 3)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([term]) => term);

  const clusters: TopicCluster[] = [];

  candidateTerms.forEach((term) => {
    const matchingRows = rows.filter((row) => {
      const text = rowTextById.get(row.id) ?? '';
      return text.includes(term);
    });

    if (matchingRows.length < 3) {
      return;
    }

    const platforms = Array.from(new Set(matchingRows.map((row) => row.platform)));
    const flaggedCount = matchingRows.filter((row) => row.is_flagged).length;

    clusters.push({
      id: `term-${term}`,
      title: toTitle(term),
      description: `${matchingRows.length} memories mention "${term}" across ${platforms.length} source${platforms.length === 1 ? '' : 's'}.`,
      eventIds: matchingRows.map((row) => row.id),
      sentiment: toSentiment(flaggedCount, matchingRows.length),
      connectionCount: platforms.length,
      totalEvents: matchingRows.length,
      platforms,
    });
  });

  return clusters;
}

function buildPlatformClusters(rows: RawEventRow[]): TopicCluster[] {
  const grouped = new Map<string, RawEventRow[]>();

  rows.forEach((row) => {
    const platform = row.platform || 'unknown';
    if (!grouped.has(platform)) {
      grouped.set(platform, []);
    }
    grouped.get(platform)?.push(row);
  });

  return Array.from(grouped.entries())
    .map(([platform, platformRows]) => {
      const flaggedCount = platformRows.filter((row) => row.is_flagged).length;
      const normalizedPlatform = platform.replace(/[_-]/g, ' ');

      return {
        id: `platform-${platform}`,
        title: toTitle(normalizedPlatform),
        description: `${platformRows.length} memories captured from ${normalizedPlatform}.`,
        eventIds: platformRows.map((row) => row.id),
        sentiment: toSentiment(flaggedCount, platformRows.length),
        connectionCount: 1,
        totalEvents: platformRows.length,
        platforms: [platform],
      } satisfies TopicCluster;
    })
    .sort((a, b) => b.totalEvents - a.totalEvents)
    .slice(0, 8);
}

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: authData, error: authError } = await supabase.auth.getUser();

    if (authError || !authData.user) {
      return NextResponse.json({ clusters: [] }, { status: 200 });
    }

    const { data, error } = await supabase
      .from('memories')
      .select('id,platform,event_type,title,content,is_flagged,timestamp')
      .eq('user_id', authData.user.id)
      .not('content', 'is', null)
      .order('timestamp', { ascending: false })
      .limit(600);

    if (error) {
      throw error;
    }

    const rows = (data ?? []) as RawEventRow[];
    const clusters = buildTermClusters(rows);
    const outputClusters = clusters.length > 0 ? clusters : buildPlatformClusters(rows);

    // Best-effort persistence for future retrieval/debug workflows.
    if (outputClusters.length > 0) {
      const nowIso = new Date().toISOString();
      await supabase.from('topics').delete().eq('user_id', authData.user.id);
      await supabase.from('topics').insert(
        outputClusters.map((cluster) => ({
          user_id: authData.user.id,
          title: cluster.title,
          description: cluster.description,
          event_ids: cluster.eventIds,
          sentiment: cluster.sentiment,
          connection_count: cluster.connectionCount,
          created_at: nowIso,
          updated_at: nowIso,
        }))
      );
    }

    return NextResponse.json({
      clusters: outputClusters,
      generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error('topic-clusters error:', error);
    return NextResponse.json({ clusters: [] }, { status: 200 });
  }
}
