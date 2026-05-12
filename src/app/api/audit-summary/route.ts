import { NextResponse } from "next/server";

import { createClient } from "@/utils/supabase/server";
import type { AuditSummary, FlaggedItem } from "@/types/dashboard";

const fallbackSummary: AuditSummary = {
  totalMemories: 0,
  overallRisk: "LIGHT",
  riskCounts: { heavy: 0, direct: 0, light: 0 },
  flaggedItems: [],
  comparisonData: [
    { eyes: "0 potentially sensitive items", recruiter: "No public results surfaced yet" },
    { eyes: "Tracked tone shifts in discussions", recruiter: "May misinterpret context" },
    { eyes: "Full historical context available", recruiter: "Only surface-level search" },
    { eyes: "Can review before it's found", recruiter: "No advance warning" },
  ],
};

const platformLabels: Record<string, string> = {
  reddit: "Reddit",
  gmail: "Gmail",
  github: "GitHub",
  notion: "Notion",
  "google-calendar": "Google Calendar",
};

type SyncStatusRow = {
  platform: string;
  total_items: number | null;
  last_sync_at: string | null;
};

function getOverallRisk(heavy: number, direct: number): AuditSummary["overallRisk"] {
  if (heavy > 0 || direct > 2) return "HEAVY";
  if (direct > 0) return "DIRECT";
  return "LIGHT";
}

function formatAge(timestamp: string | null) {
  if (!timestamp) {
    return "unknown recency";
  }

  const diffMs = Date.now() - new Date(timestamp).getTime();
  const diffDays = Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));

  if (diffDays === 0) {
    return "today";
  }

  if (diffDays === 1) {
    return "1 day ago";
  }

  return `${diffDays} days ago`;
}

function buildComparisonData(params: {
  flaggedCount: number;
  totalMemories: number;
  platformCounts: Map<string, number>;
  latestTimestamp: string | null;
}) {
  const { flaggedCount, totalMemories, platformCounts, latestTimestamp } = params;
  const coverage = totalMemories > 0 ? Math.round((flaggedCount / totalMemories) * 100) : 0;
  const sortedPlatforms = Array.from(platformCounts.entries()).sort((a, b) => b[1] - a[1]);
  const topPlatform = sortedPlatforms[0] ? platformLabels[sortedPlatforms[0][0]] ?? sortedPlatforms[0][0] : "No connected source";
  const topPlatformCount = sortedPlatforms[0]?.[1] ?? 0;
  const uniquePlatforms = platformCounts.size;

  return [
    {
      eyes: `${flaggedCount} of ${totalMemories} indexed memories are flagged for review`,
      recruiter: `${coverage}% of the archive carries explicit risk signals`,
    },
    {
      eyes: `${topPlatform} contributes ${topPlatformCount} flagged items`,
      recruiter: `${uniquePlatforms} connected sources shape the public trace`,
    },
    {
      eyes: `Latest captured activity is ${formatAge(latestTimestamp)}`,
      recruiter: `Freshness can change how the story is interpreted`,
    },
    {
      eyes: `${flaggedCount} items exceed a low-risk threshold`,
      recruiter: `That gives a concrete surface to audit before review`,
    },
  ];
}

export async function GET() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    return NextResponse.json(
      {
        error: 'Supabase is not configured.',
        fallback: fallbackSummary,
      },
      { status: 503 }
    );
  }

  try {
    const supabase = await createClient();
    const { data: authData, error: authError } = await supabase.auth.getUser();
    const user = authData.user;

    if (authError || !user) {
      return NextResponse.json(
        {
          error: 'Unauthorized',
          fallback: fallbackSummary,
        },
        { status: 401 }
      );
    }

    const userId = user.id;

    const [
      syncStatusResult,
      flaggedEventsResult,
    ] = await Promise.all([
      supabase
        .from("sync_status")
        .select("platform,total_items,last_sync_at")
        .eq("user_id", userId),
      supabase
        .from('memories')
        .select('id, platform, timestamp, content, flag_severity, is_flagged')
        .eq('user_id', userId)
        .eq('is_flagged', true)
        .order('timestamp', { ascending: false })
    ]);

    if (syncStatusResult.error) {
      throw syncStatusResult.error;
    }

    if (flaggedEventsResult.error) {
      throw flaggedEventsResult.error;
    }

    const syncRows = (syncStatusResult.data ?? []) as SyncStatusRow[];
    const totalMemories = syncRows.reduce((sum, row) => sum + (row.total_items ?? 0), 0);
    const platformCounts = new Map<string, number>();
    let latestTimestamp: string | null = null;

    syncRows.forEach((row) => {
      const count = row.total_items ?? 0;
      if (count > 0) {
        platformCounts.set(row.platform, count);
      }

      if (row.last_sync_at && (!latestTimestamp || new Date(row.last_sync_at).getTime() > new Date(latestTimestamp).getTime())) {
        latestTimestamp = row.last_sync_at;
      }
    });

    const allFlaggedEvents = flaggedEventsResult.data ?? [];
    
    const riskCounts = allFlaggedEvents.reduce(
      (acc, event) => {
        const severity = (event.flag_severity?.toUpperCase() ?? "LIGHT");
        if (severity === "HEAVY") acc.heavy += 1;
        if (severity === "DIRECT") acc.direct += 1;
        if (severity === "LIGHT") acc.light += 1;
        return acc;
      },
      { heavy: 0, direct: 0, light: 0 }
    );

    const flaggedItems: FlaggedItem[] = allFlaggedEvents.slice(0, 4).map((event) => {
      const severity = (event.flag_severity?.toUpperCase() ?? "LIGHT") as FlaggedItem["severity"];
      return {
        id: event.id,
        severity: severity === "HEAVY" || severity === "DIRECT" || severity === "LIGHT" ? severity : "LIGHT",
        platform: platformLabels[event.platform] ?? event.platform,
        date: event.timestamp ? new Date(event.timestamp).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "Unknown date",
        content: event.content || "Flagged content unavailable.",
      };
    });

    const summary: AuditSummary = {
      totalMemories,
      overallRisk: getOverallRisk(riskCounts.heavy, riskCounts.direct),
      riskCounts,
      flaggedItems,
      comparisonData: buildComparisonData({
        flaggedCount: flaggedItems.length,
        totalMemories,
        platformCounts,
        latestTimestamp,
      }),
    };

    return NextResponse.json(summary, { status: 200 });
  } catch (error) {
    console.error("audit-summary error:", error);
    return NextResponse.json(
      {
        error: 'Unable to compute audit summary right now.',
        fallback: fallbackSummary,
      },
      { status: 500 }
    );
  }
}
