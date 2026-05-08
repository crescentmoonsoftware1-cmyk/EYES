import { NextResponse } from 'next/server';

import { createClient } from '@/utils/supabase/server';
import type { AuditSummary, FeedItem, PlatformStatus } from '@/types/dashboard';

type SyncStatusRow = {
  platform: string;
  status: PlatformStatus['status'] | null;
  sync_progress: number | null;
  total_items: number | null;
  last_sync_at: string | null;
  error_message: string | null;
};

type RawEventRow = {
  id: string;
  platform: string;
  title: string | null;
  content: string | null;
  timestamp: string | null;
  event_type: string | null;
  author: string | null;
  is_flagged: boolean | null;
  flag_severity: string | null;
  flag_reason: string | null;
};

const fallbackSummary: AuditSummary = {
  totalMemories: 0,
  overallRisk: 'LIGHT',
  riskCounts: { heavy: 0, direct: 0, light: 0 },
  flaggedItems: [],
  comparisonData: [],
};

const platformLabelMap: Record<string, string> = {
  github: 'GitHub',
  gmail: 'Gmail',
  notion: 'Notion',
  'google-calendar': 'Google Calendar',
  slack: 'Slack',
  discord: 'Discord',
  reddit: 'Reddit',
};

function getOverallRisk(heavy: number, direct: number): AuditSummary['overallRisk'] {
  if (heavy > 0 || direct > 2) return 'HEAVY';
  if (direct > 0) return 'DIRECT';
  return 'LIGHT';
}

function buildComparisonData(totalMemories: number, flaggedCount: number, latestTimestamp: string | null) {
  const coverage = totalMemories > 0 ? Math.round((flaggedCount / totalMemories) * 100) : 0;
  return [
    {
      eyes: `${flaggedCount} of ${totalMemories} indexed memories are flagged for review`,
      recruiter: `${coverage}% of the archive carries explicit risk signals`,
    },
    {
      eyes: `Latest captured activity is ${latestTimestamp ? new Date(latestTimestamp).toLocaleDateString() : 'unknown'}`,
      recruiter: 'Freshness can change how the story is interpreted',
    },
    {
      eyes: `The dashboard aggregates source, risk, and feed state in one pass`,
      recruiter: 'This removes three separate first-paint requests',
    },
    {
      eyes: `Loading now favors a single bootstrap payload`,
      recruiter: 'Less coordination, faster initial render',
    },
  ];
}

function mapSummary(syncRows: SyncStatusRow[], flaggedRows: RawEventRow[]): AuditSummary {
  const totalMemories = syncRows.reduce((sum, row) => sum + (row.total_items ?? 0), 0);
  const latestTimestamp = syncRows.reduce<string | null>((latest, row) => {
    if (!row.last_sync_at) return latest;
    if (!latest) return row.last_sync_at;
    return new Date(row.last_sync_at).getTime() > new Date(latest).getTime() ? row.last_sync_at : latest;
  }, null);

  const riskCounts = flaggedRows.reduce(
    (acc, row) => {
      const severity = (row.flag_severity?.toUpperCase() ?? 'LIGHT');
      if (severity === 'HEAVY') acc.heavy += 1;
      if (severity === 'DIRECT') acc.direct += 1;
      if (severity === 'LIGHT') acc.light += 1;
      return acc;
    },
    { heavy: 0, direct: 0, light: 0 }
  );

  const flaggedItems = flaggedRows.slice(0, 4).map((row) => ({
    id: row.id,
    severity: ((row.flag_severity?.toUpperCase() ?? 'LIGHT') as AuditSummary['flaggedItems'][number]['severity']),
    platform: platformLabelMap[row.platform] ?? row.platform,
    date: row.timestamp ? new Date(row.timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'Unknown date',
    content: row.content || 'Flagged content unavailable.',
  }));

  return {
    totalMemories,
    overallRisk: getOverallRisk(riskCounts.heavy, riskCounts.direct),
    riskCounts,
    flaggedItems,
    comparisonData: buildComparisonData(totalMemories, flaggedRows.length, latestTimestamp),
  };
}

function mapPlatforms(syncRows: SyncStatusRow[]): PlatformStatus[] {
  const platforms = syncRows.map((row) => ({
    id: row.platform,
    name: platformLabelMap[row.platform] ?? row.platform,
    connected: true,
    status: (row.status ?? 'idle') as PlatformStatus['status'],
    items: row.total_items ?? 0,
    errorMessage: row.error_message,
  }));

  return platforms;
}

function mapFeed(rows: RawEventRow[]): FeedItem[] {
  return rows.slice(0, 80).map((row) => ({
    id: row.id,
    platform: row.platform,
    title: row.title,
    content: row.content,
    timestamp: row.timestamp,
    author: row.author,
    is_flagged: Boolean(row.is_flagged),
    flag_severity: row.flag_severity,
    flag_reason: row.flag_reason,
    event_type: row.event_type,
  }));
}

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: authData, error: authError } = await supabase.auth.getUser();
    const user = authData.user;

    if (authError || !user) {
      return NextResponse.json(
        {
          summary: fallbackSummary,
          platforms: [],
          feedEvents: [],
        },
        { status: 200 }
      );
    }

    const [syncStatusResult, rawEventsResult] = await Promise.all([
      supabase
        .from('sync_status')
        .select('platform,status,sync_progress,total_items,last_sync_at,error_message')
        .eq('user_id', user.id),
      supabase
        .from('raw_events')
        .select('id, platform, title, content, timestamp, event_type, author, is_flagged, flag_severity, flag_reason')
        .eq('user_id', user.id)
        .order('timestamp', { ascending: false })
        .limit(300),
    ]);

    if (syncStatusResult.error) throw syncStatusResult.error;
    if (rawEventsResult.error) throw rawEventsResult.error;

    const syncRows = (syncStatusResult.data ?? []) as SyncStatusRow[];
    const rawRows = (rawEventsResult.data ?? []) as RawEventRow[];
    const flaggedRows = rawRows.filter((row) => Boolean(row.is_flagged));

    const response = NextResponse.json(
      {
        summary: mapSummary(syncRows, flaggedRows),
        platforms: mapPlatforms(syncRows),
        feedEvents: mapFeed(rawRows),
      },
      { status: 200 }
    );

    // Cache for 30s with stale-while-revalidate for 5min
    // Significantly reduces load on first-paint and subsequent requests within window
    response.headers.set('Cache-Control', 'public, s-maxage=30, stale-while-revalidate=300');
    response.headers.set('CDN-Cache-Control', 's-maxage=30');
    
    return response;
  } catch (error) {
    console.error('[Dashboard Bootstrap] error:', error);
    const response = NextResponse.json(
      {
        summary: fallbackSummary,
        platforms: [],
        feedEvents: [],
      },
      { status: 200 }
    );

    // Cache error responses for 5s to avoid thundering herd
    response.headers.set('Cache-Control', 'public, s-maxage=5, stale-while-revalidate=30');
    return response;
  }
}
