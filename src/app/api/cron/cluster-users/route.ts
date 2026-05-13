import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { invokeModel } from '@/services/ai/ai';

const SERVICE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const CRON_SECRET = process.env.CRON_SECRET;

// ─── Types ────────────────────────────────────────────────────────────────────
type StateVector = {
  id: string;
  user_id: string;
  date: string;
  message_volume: number;
  sentiment_score: number;
  topic_entropy: number;
  output_cadence: number;
  social_breadth: number;
  platform_mix: Record<string, number>;
  time_of_day_bias: number;
  dominant_platform: string | null;
  dominant_topic: string | null;
};

type ClusterResult = {
  draft_label: string;
  signature: string;
  representative_quote: string;
  characteristics: string[];
  day_indices: number[]; // which vectors belong to this cluster
};

// ─── Main cron handler ────────────────────────────────────────────────────────
export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization');
  if (CRON_SECRET && authHeader !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createClient(SERVICE_URL, SERVICE_KEY, { auth: { persistSession: false } }) as any;

  // Get all users with ≥21 state vectors (minimum for meaningful clustering)
  const { data: vectorCounts, error: countErr } = await supabase
    .from('state_vectors')
    .select('user_id')
    .throwOnError();

  if (countErr) return NextResponse.json({ error: countErr.message }, { status: 500 });

  // Group by user and count
  const userCounts: Record<string, number> = {};
  for (const row of (vectorCounts ?? [])) {
    userCounts[row.user_id] = (userCounts[row.user_id] ?? 0) + 1;
  }
  const eligibleUsers = Object.entries(userCounts)
    .filter(([, count]) => count >= 21)
    .map(([userId]) => userId);

  console.log(`[Clustering] ${eligibleUsers.length} users eligible (≥21 state vectors)`);

  const results: Record<string, unknown> = {};

  for (const userId of eligibleUsers) {
    try {
      const clusterCount = await runClusteringForUser(supabase, userId);
      const loopCount    = await runLoopDetectionForUser(supabase, userId);
      const driftResult  = await runDriftDetectionForUser(supabase, userId);
      results[userId] = { clusters: clusterCount, loops: loopCount, drift: driftResult };
    } catch (err) {
      console.error(`[Clustering] Failed for user ${userId}:`, err);
      results[userId] = { error: String(err) };
    }
  }

  return NextResponse.json({ eligible: eligibleUsers.length, results });
}

// ─── Task #7: Clustering ──────────────────────────────────────────────────────
async function runClusteringForUser(supabase: any, userId: string): Promise<number> {
  // Fetch last 90 days of state vectors
  const { data: vectors, error } = await supabase
    .from('state_vectors')
    .select('*')
    .eq('user_id', userId)
    .order('date', { ascending: true })
    .limit(90);

  if (error || !vectors || vectors.length < 21) return 0;

  const typedVectors = vectors as StateVector[];

  // Summarize vectors for Claude — describe each week as a digest
  const weekSummaries = buildWeekSummaries(typedVectors);

  // Ask Claude to detect 3-7 behavioral clusters
  const aiResponse = await invokeModel({
    capability: 'classify',
    system: `You are EYES, a behavioral intelligence system. Analyze a user's behavioral state vectors across time.
Identify 3-7 distinct recurring behavioral states (clusters). Each cluster should represent a genuinely different mode of operation.
Respond with valid JSON only. No markdown, no explanation outside JSON.`,
    messages: [{
      role: 'user',
      content: `Here are week-by-week behavioral summaries for a user. Each week shows: message volume, sentiment, topic variety, social breadth, dominant platform, dominant topics.

${weekSummaries}

Identify 3-7 distinct behavioral clusters. For each cluster, specify which week indices belong to it.

Return exactly:
{
  "clusters": [
    {
      "draft_label": "3-5 word behavioral state name",
      "signature": "2-3 sentence description of what makes this state distinctive",
      "representative_quote": "A quote or phrase that captures this state (can be descriptive)",
      "characteristics": ["trait1", "trait2", "trait3"],
      "day_indices": [0, 1, 4, 7]
    }
  ]
}`,
    }],
    preference: 'auto',
    capture: false,
  });

  if (!aiResponse) return 0;

  let parsed: { clusters: ClusterResult[] } | null = null;
  try {
    const jsonMatch = String(aiResponse).match(/\{[\s\S]*\}/);
    if (jsonMatch) parsed = JSON.parse(jsonMatch[0]);
  } catch { return 0; }

  if (!parsed?.clusters?.length) return 0;

  // Increment cluster_version for this user
  const { data: existing } = await supabase
    .from('cognitive_clusters')
    .select('cluster_version')
    .eq('user_id', userId)
    .order('cluster_version', { ascending: false })
    .limit(1)
    .maybeSingle();

  const nextVersion = (existing?.cluster_version ?? 0) + 1;

  // Mark all previous clusters as not current
  await supabase
    .from('cognitive_clusters')
    .update({ is_current: false })
    .eq('user_id', userId);

  // Upsert new clusters
  for (let i = 0; i < parsed.clusters.length; i++) {
    const c = parsed.clusters[i];
    const clusterId = `cluster-v${nextVersion}-${i + 1}`;
    const isLast = i === parsed.clusters.length - 1;

    // Find which state vectors belong to this cluster
    const memberVectorIds = (c.day_indices ?? [])
      .filter(idx => idx >= 0 && idx < typedVectors.length)
      .map(idx => typedVectors[idx]?.id)
      .filter(Boolean);

    const { data: clusterRow } = await supabase
      .from('cognitive_clusters')
      .upsert({
        user_id:             userId,
        cluster_id:          clusterId,
        cluster_label:       c.draft_label,
        cluster_description: c.signature,
        characteristics:     c.characteristics ?? [],
        evidence_memory_ids: memberVectorIds,
        is_current:          isLast, // most recent cluster = current
        occurrence_count:    memberVectorIds.length,
        cluster_version:     nextVersion,
        updated_at:          new Date().toISOString(),
      }, { onConflict: 'user_id,cluster_id' })
      .select('id')
      .maybeSingle();

    // Update cluster_id on the state_vectors that belong to this cluster
    if (clusterRow?.id && memberVectorIds.length > 0) {
      await supabase
        .from('state_vectors')
        .update({ cluster_id: clusterRow.id, cluster_version: nextVersion })
        .in('id', memberVectorIds)
        .eq('user_id', userId);
    }
  }

  console.log(`[Clustering] ✓ user=${userId.slice(0, 8)} clusters=${parsed.clusters.length} v${nextVersion}`);
  return parsed.clusters.length;
}

// ─── Task #8: Loop Detection ──────────────────────────────────────────────────
async function runLoopDetectionForUser(supabase: any, userId: string): Promise<number> {
  // Get all state vectors with cluster assignments
  const { data: vectors, error } = await supabase
    .from('state_vectors')
    .select('id, date, cluster_id')
    .eq('user_id', userId)
    .not('cluster_id', 'is', null)
    .order('date', { ascending: true });

  if (error || !vectors || vectors.length < 21) return 0;

  // Group into contiguous runs per cluster
  type Run = { cluster_id: string; start: string; end: string; duration_days: number };
  const runs: Run[] = [];
  let currentRun: Run | null = null;

  for (const v of vectors) {
    if (!currentRun || currentRun.cluster_id !== v.cluster_id) {
      if (currentRun) runs.push(currentRun);
      currentRun = { cluster_id: v.cluster_id, start: v.date, end: v.date, duration_days: 1 };
    } else {
      currentRun.end = v.date;
      currentRun.duration_days++;
    }
  }
  if (currentRun) runs.push(currentRun);

  // Group runs by cluster
  const byCluster: Record<string, Run[]> = {};
  for (const run of runs) {
    if (!byCluster[run.cluster_id]) byCluster[run.cluster_id] = [];
    byCluster[run.cluster_id].push(run);
  }

  let loopsDetected = 0;

  for (const [clusterId, clusterRuns] of Object.entries(byCluster)) {
    if (clusterRuns.length < 3) continue;

    // Compute inter-entry intervals (days between end of run N and start of run N+1)
    const intervals = clusterRuns.slice(1).map((r, i) => {
      const prevEnd = new Date(clusterRuns[i].end);
      const curStart = new Date(r.start);
      return Math.round((curStart.getTime() - prevEnd.getTime()) / 86400000);
    });

    const durations = clusterRuns.map(r => r.duration_days);
    const intervalMean = mean(intervals);
    const intervalStd  = std(intervals);
    const durationMean = mean(durations);

    // Only flag if interval is consistent (stddev < 30% of mean)
    if (intervalMean === 0 || intervalStd / intervalMean >= 0.3) continue;

    const confidence = Math.round((1 - intervalStd / intervalMean) * 100) / 100;

    // Fetch cluster label for the description
    const { data: cluster } = await supabase
      .from('cognitive_clusters')
      .select('cluster_label')
      .eq('id', clusterId)
      .maybeSingle();

    const label = cluster?.cluster_label ?? 'Unknown State';
    const triggerPattern = await detectTriggerPattern(supabase, userId, clusterRuns);

    await supabase
      .from('detected_loops')
      .upsert({
        user_id:            userId,
        loop_description:   `Recurring "${label}" state (${clusterRuns.length} occurrences, avg ${Math.round(durationMean)} days each)`,
        trigger_pattern:    triggerPattern,
        occurrence_count:   clusterRuns.length,
        avg_duration_days:  Math.round(durationMean * 10) / 10,
        last_occurrence_at: new Date(clusterRuns[clusterRuns.length - 1].start).toISOString(),
        evidence_memory_ids: [],
        is_active:          true,
        updated_at:         new Date().toISOString(),
      }, { onConflict: 'user_id,loop_description' });

    loopsDetected++;
  }

  console.log(`[Loops] ✓ user=${userId.slice(0, 8)} loops=${loopsDetected}`);
  return loopsDetected;
}

// ─── Task #9: Drift Detection ─────────────────────────────────────────────────
async function runDriftDetectionForUser(supabase: any, userId: string): Promise<boolean> {
  const periodEnd   = new Date();
  const periodStart = new Date(Date.now() - 14 * 86400000); // last 14 days

  const periodStartStr = periodStart.toISOString().split('T')[0];
  const periodEndStr   = periodEnd.toISOString().split('T')[0];

  // Fetch stated vs lived memories for the period
  const [statedRes, livedRes] = await Promise.all([
    supabase
      .from('memories')
      .select('content, platform, timestamp')
      .eq('user_id', userId)
      .eq('content_type', 'stated')
      .gte('date_bucket', periodStartStr)
      .lte('date_bucket', periodEndStr)
      .limit(30),
    supabase
      .from('memories')
      .select('content, platform, timestamp')
      .eq('user_id', userId)
      .eq('content_type', 'lived')
      .gte('date_bucket', periodStartStr)
      .lte('date_bucket', periodEndStr)
      .limit(30),
  ]);

  const stated = statedRes.data ?? [];
  const lived  = livedRes.data ?? [];

  if (stated.length < 3 || lived.length < 3) return false;

  // Use AI to identify gaps between stated values and lived behaviour
  const aiResponse = await invokeModel({
    capability: 'classify',
    system: 'You are EYES, a behavioral intelligence system. Identify gaps between stated intentions and lived behavior. Respond with valid JSON only.',
    messages: [{
      role: 'user',
      content: `Compare stated content (intentions, goals, values) vs lived content (actual activities, calendar, commits) for the last 14 days.

STATED (what the user says/writes):
${stated.slice(0, 10).map((m: { content: string }) => `- ${m.content.slice(0, 150)}`).join('\n')}

LIVED (what the user actually does):
${lived.slice(0, 10).map((m: { content: string }) => `- ${m.content.slice(0, 150)}`).join('\n')}

Identify 1-4 specific gaps. Return:
{
  "gaps": [
    {
      "stated": "What they said/intended",
      "lived": "What they actually did",
      "gap_summary": "One sentence describing the discrepancy"
    }
  ]
}`,
    }],
    preference: 'auto',
    capture: false,
  });

  if (!aiResponse) return false;

  let gaps: Array<{ stated: string; lived: string; gap_summary: string }> = [];
  try {
    const jsonMatch = String(aiResponse).match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      gaps = parsed.gaps ?? [];
    }
  } catch { return false; }

  if (!gaps.length) return false;

  await supabase
    .from('drift_snapshots')
    .insert({
      user_id:      userId,
      period_start: periodStartStr,
      period_end:   periodEndStr,
      gaps:         gaps,
    });

  console.log(`[Drift] ✓ user=${userId.slice(0, 8)} gaps=${gaps.length}`);
  return true;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function buildWeekSummaries(vectors: StateVector[]): string {
  const weeks: StateVector[][] = [];
  for (let i = 0; i < vectors.length; i += 7) {
    weeks.push(vectors.slice(i, i + 7));
  }

  return weeks.map((week, i) => {
    const avgVol  = Math.round(mean(week.map(v => v.message_volume)));
    const avgSent = Math.round(mean(week.map(v => v.sentiment_score)) * 100) / 100;
    const avgEnt  = Math.round(mean(week.map(v => v.topic_entropy)) * 100) / 100;
    const avgSoc  = Math.round(mean(week.map(v => v.social_breadth)));
    const topics  = [...new Set(week.map(v => v.dominant_topic).filter(Boolean))].slice(0, 3).join(', ');
    const platforms = [...new Set(week.map(v => v.dominant_platform).filter(Boolean))].slice(0, 3).join(', ');
    return `Week ${i + 1} (${week[0]?.date} to ${week[week.length - 1]?.date}): vol=${avgVol}, sentiment=${avgSent}, entropy=${avgEnt}, social=${avgSoc}, topics=[${topics}], platforms=[${platforms}]`;
  }).join('\n');
}

async function detectTriggerPattern(supabase: any, userId: string, runs: { start: string }[]): Promise<string> {
  // Look at what happened in the 3 days before each run started
  const triggers: string[] = [];
  for (const run of runs.slice(0, 3)) {
    const beforeDate = new Date(run.start);
    beforeDate.setDate(beforeDate.getDate() - 3);
    const { data } = await supabase
      .from('memories')
      .select('dominant_topic, platform')
      .eq('user_id', userId)
      .gte('date_bucket', beforeDate.toISOString().split('T')[0])
      .lt('date_bucket', run.start)
      .limit(5);
    if (data?.length) {
      triggers.push(data.map((d: { dominant_topic: string }) => d.dominant_topic).filter(Boolean).join(', '));
    }
  }
  return triggers.filter(Boolean).join(' | ') || 'Pattern not yet clear';
}

function mean(arr: number[]): number {
  if (!arr.length) return 0;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function std(arr: number[]): number {
  if (arr.length < 2) return 0;
  const m = mean(arr);
  return Math.sqrt(arr.reduce((sum, x) => sum + (x - m) ** 2, 0) / arr.length);
}
