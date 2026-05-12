import { NextResponse } from 'next/server';

import { createClient } from '@/utils/supabase/server';

type FeedRow = {
  id: string;
  platform: string;
  title: string | null;
  content: string | null;
  timestamp: string | null;
  event_type: string | null;
  author: string | null;
  is_flagged: boolean | null;
  flag_severity: string | null;
  metadata?: Record<string, unknown> | null;
};

type TimelineBucket = {
  month: string;
  count: number;
};

type TimelineStats = {
  windowMonths: number;
  peakMonth: string;
  peakCount: number;
  monthlyAverage: number;
  last30DaysCount: number;
  trendPercent: number;
};

function monthLabel(date: Date) {
  return date.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
}

function buildTimeline(rows: FeedRow[], windowMonths: number): TimelineBucket[] {
  const now = new Date();
  const buckets = new Map<string, number>();

  for (let i = windowMonths - 1; i >= 0; i -= 1) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    buckets.set(monthLabel(d), 0);
  }

  rows.forEach((row) => {
    if (!row.timestamp) return;
    const date = new Date(row.timestamp);
    const key = monthLabel(new Date(date.getFullYear(), date.getMonth(), 1));
    if (buckets.has(key)) {
      buckets.set(key, (buckets.get(key) ?? 0) + 1);
    }
  });

  return Array.from(buckets.entries()).map(([month, count]) => ({ month, count }));
}

function buildTimelineStats(rows: FeedRow[], timeline: TimelineBucket[], windowMonths: number): TimelineStats {
  const nowMs = Date.now();
  const since30DaysMs = nowMs - 30 * 24 * 60 * 60 * 1000;
  const last30DaysCount = rows.filter((row) => {
    if (!row.timestamp) return false;
    return new Date(row.timestamp).getTime() >= since30DaysMs;
  }).length;

  const peak = timeline.reduce(
    (best, point) => (point.count > best.count ? point : best),
    timeline[0] ?? { month: 'N/A', count: 0 }
  );

  const monthlyAverage = timeline.length > 0
    ? Number((timeline.reduce((total, point) => total + point.count, 0) / timeline.length).toFixed(2))
    : 0;

  const midpoint = Math.max(1, Math.floor(timeline.length / 2));
  const firstHalf = timeline.slice(0, midpoint).reduce((total, point) => total + point.count, 0);
  const secondHalf = timeline.slice(midpoint).reduce((total, point) => total + point.count, 0);
  const baseline = firstHalf === 0 ? 1 : firstHalf;
  const trendPercent = Number((((secondHalf - firstHalf) / baseline) * 100).toFixed(2));

  return {
    windowMonths,
    peakMonth: peak.month,
    peakCount: peak.count,
    monthlyAverage,
    last30DaysCount,
    trendPercent,
  };
}

function toEventTagSet(row: FeedRow) {
  const tags: string[] = [];
  if (row.event_type) tags.push(row.event_type);
  if (row.flag_severity) tags.push(`risk:${row.flag_severity.toLowerCase()}`);
  if (row.is_flagged) tags.push('flagged');
  return tags;
}

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: authData, error: authError } = await supabase.auth.getUser();
    const user = authData.user;

    if (authError || !user) {
      return NextResponse.json({ events: [], timeline: [] }, { status: 200 });
    }

    const { data, error } = await supabase
      .from('memories')
      .select('id, platform, title, content, timestamp, event_type, author, is_flagged, flag_severity')
      .eq('user_id', user.id)
      .not('content', 'is', null)
      .order('timestamp', { ascending: false })
      .limit(300);

    if (error) {
      throw error;
    }

    const rows = (data ?? []) as FeedRow[];
    const timeline = buildTimeline(rows, 24);
    const timelineStats = buildTimelineStats(rows, timeline, 24);

    const events = rows.slice(0, 80).map((row) => ({
      id: row.id,
      platform: row.platform,
      title: row.title,
      content: row.content,
      timestamp: row.timestamp,
      eventType: row.event_type,
      author: row.author,
      isFlagged: Boolean(row.is_flagged),
      flagSeverity: row.flag_severity,
      tags: toEventTagSet(row),
      metadata: row.metadata ?? {},
    }));

    const platformCounts = rows.reduce<Record<string, number>>((acc, row) => {
      acc[row.platform] = (acc[row.platform] ?? 0) + 1;
      return acc;
    }, {});

    return NextResponse.json({
      events,
      timeline,
      timelineStats,
      platformCounts,
      latestEventAt: rows[0]?.timestamp ?? null,
    });
  } catch (error) {
    console.error('memory-feed error:', error);
    return NextResponse.json({ events: [], timeline: [], timelineStats: null }, { status: 200 });
  }
}
