import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { invokeModel } from '@/services/ai/ai';
import { getPrompt } from '@/services/prompts/getPrompt';
import { sendClusterReadyEmail } from '@/services/email/resend';
import { UMAP } from 'umap-js';
import { DBSCAN } from 'density-clustering';

const SERVICE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const CRON_SECRET = process.env.CRON_SECRET;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseAdminClient = any;

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
  day_indices: number[];
};
void (undefined as unknown as ClusterResult); // retained for future API contract typing

// ─── Main cron handler ────────────────────────────────────────────────────────
export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization');
  if (CRON_SECRET && authHeader !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createClient(SERVICE_URL, SERVICE_KEY, { auth: { persistSession: false } }) as any;

  // Get all users with ≥3 state vectors (lowered from 21 for early-stage users)
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
    .filter(([, count]) => count >= 3)
    .map(([userId]) => userId);

  console.log(`[Clustering] ${eligibleUsers.length} users eligible (≥3 state vectors)`);

  const results: Record<string, unknown> = {};

  for (const userId of eligibleUsers) {
    try {
      const clusterCount = await runClusteringForUser(supabase, userId);
      const loopCount    = await runLoopDetectionForUser(supabase, userId);
      const driftResult  = await runDriftDetectionForUser(supabase, userId);
      // Wire entity correlations — runs after clustering so cluster_id refs are fresh
      const corrCount    = await runEntityCorrelationsForUser(supabase, userId);
      results[userId] = { clusters: clusterCount, loops: loopCount, drift: driftResult, entityCorrelations: corrCount };

      // Send cluster-ready email on the FIRST ever clustering run (version 1 only)
      if (clusterCount > 0) {
        try {
          const { data: versionCheck } = await supabase
            .from('cognitive_clusters')
            .select('cluster_version')
            .eq('user_id', userId)
            .eq('cluster_version', 1)
            .limit(1)
            .maybeSingle();

          if (versionCheck) { // version 1 just created
            const { data: userData } = await supabase.auth.admin.getUserById(userId);
            if (userData?.user?.email) {
              const name = userData.user.user_metadata?.full_name
                ?? userData.user.user_metadata?.name
                ?? userData.user.email.split('@')[0];
              sendClusterReadyEmail(userData.user.email, name, clusterCount); // non-blocking
            }
          }
        } catch { /* non-fatal */ }
      }
    } catch (err) {
      console.error(`[Clustering] Failed for user ${userId}:`, err);
      results[userId] = { error: String(err) };
    }
  }

  return NextResponse.json({ eligible: eligibleUsers.length, results });
}

// Native JS clustering — no external service required

// Converts a StateVector into a fixed-length numerical array for UMAP
function vectorToArray(v: StateVector): number[] {
  // Flatten platform_mix into top-5 known platforms (0 if absent)
  const TOP_PLATFORMS = ['gmail', 'slack', 'notion', 'github', 'google-calendar'];
  const platformValues = TOP_PLATFORMS.map(p => v.platform_mix?.[p] ?? 0);
  return [
    v.message_volume,
    v.sentiment_score,
    v.topic_entropy,
    v.output_cadence,
    v.social_breadth,
    v.time_of_day_bias,
    ...platformValues, // 5 more dims → total = 11 dims
  ];
}

async function runClusteringForUser(supabase: SupabaseAdminClient, userId: string): Promise<number> {
  // Fetch last 90 days of state vectors
  const { data: vectors, error } = await supabase
    .from('state_vectors')
    .select('*')
    .eq('user_id', userId)
    .order('date', { ascending: true })
    .limit(90);

  if (error || !vectors || vectors.length < 3) return 0;

  const typedVectors = vectors as StateVector[];

  // ── Step 1: UMAP reduce + DBSCAN cluster (pure JS, no external service) ───
  let labels: number[] | null = null;
  let umapCoords: number[][] | null = null;

  try {
    const numericalVectors = typedVectors.map(vectorToArray);

    // UMAP: reduce 11-dim state vectors → 2D for mind map visualization
    const nNeighbors = Math.min(10, numericalVectors.length - 1);
    const umap = new UMAP({
      nComponents: 2,
      nNeighbors: nNeighbors,
      minDist: 0.1,
      spread: 1.0,
    });
    const embedding = umap.fit(numericalVectors); // number[][] shape: (n, 2)
    umapCoords = embedding as number[][];

    // DBSCAN: cluster on full-dimensional vectors (not UMAP reduced)
    // epsilon = neighborhood radius, minPts = min points to form cluster
    const dbscan = new DBSCAN();
    const minClusterSize = 5; // minimum points to form a cluster
    const epsilon = 2.5; // tuned for normalized 11-dim state vectors
    const clusters = dbscan.run(numericalVectors, epsilon, minClusterSize);

    // Convert cluster array-of-arrays → flat label array (-1 = noise)
    const rawLabels = new Array(numericalVectors.length).fill(-1);
    clusters.forEach((clusterIndices: number[], clusterIdx: number) => {
      clusterIndices.forEach((pointIdx: number) => {
        rawLabels[pointIdx] = clusterIdx;
      });
    });
    labels = rawLabels;

    const nClusters = clusters.length;
    const noiseCount = rawLabels.filter((l: number) => l === -1).length;
    const noiseRatio = noiseCount / rawLabels.length;
    console.log(`[Clustering] JS UMAP+DBSCAN OK — ${nClusters} clusters, noise=${(noiseRatio * 100).toFixed(1)}%`);
  } catch (err) {
    console.warn('[Clustering] JS clustering failed, falling back to week-grouping:', err);
  }

  // ── Step 2: Group vectors by label ────────────────────────────────────────
  // If Modal succeeded, group by numeric label; otherwise fall back to Claude week-grouping
  let clusterGroups: Map<number, StateVector[]>;

  if (labels && labels.length === typedVectors.length) {
    clusterGroups = new Map();
    for (let i = 0; i < typedVectors.length; i++) {
      const label = labels[i];
      if (label === -1) continue; // Skip noise points
      if (!clusterGroups.has(label)) clusterGroups.set(label, []);
      clusterGroups.get(label)!.push(typedVectors[i]);
    }
  } else {
    // Fallback: group by week (Claude handles grouping in label step)
    clusterGroups = new Map();
    for (let i = 0; i < typedVectors.length; i += 7) {
      clusterGroups.set(clusterGroups.size, typedVectors.slice(i, i + 7));
    }
  }

  if (clusterGroups.size === 0) return 0;

  // ── Step 3: Claude writes ONE label + description per cluster ─────────────
  const nextVersion = await getNextClusterVersion(supabase, userId);

  await supabase
    .from('cognitive_clusters')
    .update({ is_current: false })
    .eq('user_id', userId);

  let clustersWritten = 0;

  for (const [clusterIndex, memberVectors] of clusterGroups.entries()) {
    // Build a compact summary of this cluster for Claude
    const avgVol  = Math.round(mean(memberVectors.map(v => v.message_volume)));
    const avgSent = Math.round(mean(memberVectors.map(v => v.sentiment_score)) * 100) / 100;
    const avgEnt  = Math.round(mean(memberVectors.map(v => v.topic_entropy)) * 100) / 100;
    const topics  = [...new Set(memberVectors.map(v => v.dominant_topic).filter(Boolean))].slice(0, 4).join(', ');
    const platforms = [...new Set(memberVectors.map(v => v.dominant_platform).filter(Boolean))].slice(0, 3).join(', ');

    // ONE Claude call per cluster — label written from versioned prompt in DB
    const clusterDescPrompt = await getPrompt('cluster_description');
    const aiResponse = await invokeModel({
      capability: 'classify',
      system: clusterDescPrompt,
      messages: [{
        role: 'user',
        content: `This behavioral cluster (${memberVectors.length} days) has:\navg message volume: ${avgVol}, avg sentiment: ${avgSent}, topic entropy: ${avgEnt}\ndominant topics: ${topics || 'varied'}, dominant platforms: ${platforms || 'varied'}\n\nReturn:\n{"label":"3-5 word state name","description":"2-3 sentences describing what makes this state distinctive","characteristics":["trait1","trait2","trait3"]}`,
      }],
      preference: 'auto',
      capture: false,
    });

    let label = `Cluster ${clusterIndex + 1}`;
    let description = `A recurring behavioral state observed across ${memberVectors.length} days.`;
    let characteristics: string[] = [];

    try {
      const match = String(aiResponse ?? '').match(/\{[\s\S]*?\}/);
      if (match) {
        const parsed = JSON.parse(match[0]);
        label           = parsed.label ?? label;
        description     = parsed.description ?? description;
        characteristics = parsed.characteristics ?? [];
      }
    } catch { /* use defaults */ }

    const clusterId = `cluster-v${nextVersion}-${clusterIndex + 1}`;
    const memberIds = memberVectors.map(v => v.id);

    // Store 2D UMAP coords for this cluster's members (for Mind Map)
    const clusterCoords = umapCoords
      ? memberVectors.map((_, i) => {
          const originalIdx = typedVectors.indexOf(memberVectors[i]);
          return umapCoords![originalIdx] ?? [0, 0];
        })
      : null;

    const { data: clusterRow } = await supabase
      .from('cognitive_clusters')
      .upsert({
        user_id:             userId,
        cluster_id:          clusterId,
        cluster_label:       label,
        cluster_description: description,
        characteristics:     characteristics,
        evidence_memory_ids: memberIds,
        is_current:          true,
        occurrence_count:    memberVectors.length,
        cluster_version:     nextVersion,
        umap_coords:         clusterCoords ? JSON.stringify(clusterCoords) : null,
        updated_at:          new Date().toISOString(),
      }, { onConflict: 'user_id,cluster_id' })
      .select('id')
      .maybeSingle();

    if (clusterRow?.id && memberIds.length > 0) {
      await supabase
        .from('state_vectors')
        .update({ cluster_id: clusterRow.id, cluster_version: nextVersion })
        .in('id', memberIds)
        .eq('user_id', userId);
    }

    clustersWritten++;
  }

  console.log(`[Clustering] ✓ user=${userId.slice(0, 8)} clusters=${clustersWritten} v${nextVersion} (Modal=${!!labels})`);
  return clustersWritten;
}

async function getNextClusterVersion(supabase: SupabaseAdminClient, userId: string): Promise<number> {
  const { data } = await supabase
    .from('cognitive_clusters')
    .select('cluster_version')
    .eq('user_id', userId)
    .order('cluster_version', { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data?.cluster_version ?? 0) + 1;
}

// ─── Task #8: Loop Detection ──────────────────────────────────────────────────
async function runLoopDetectionForUser(supabase: SupabaseAdminClient, userId: string): Promise<number> {
  // Get all state vectors with cluster assignments
  const { data: vectors, error } = await supabase
    .from('state_vectors')
    .select('id, date, cluster_id')
    .eq('user_id', userId)
    .not('cluster_id', 'is', null)
    .order('date', { ascending: true });

  if (error || !vectors || vectors.length < 3) return 0;

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
    void confidence; // retained for future loop score computation

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
async function runDriftDetectionForUser(supabase: SupabaseAdminClient, userId: string): Promise<boolean> {
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
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function buildWeekSummaries(vectors: StateVector[]): string {
   
  void vectors;
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

async function detectTriggerPattern(supabase: SupabaseAdminClient, userId: string, runs: { start: string }[]): Promise<string> {
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

// ─── Entity Correlation Computation ───────────────────────────────────────────
/**
 * Computes entity ↔ cognitive cluster lift scores for a single user.
 * Mirrors /api/cognitive/entity-correlations but runs inline (no HTTP self-call).
 * Called automatically from the weekly cluster-users cron after clustering.
 */
async function runEntityCorrelationsForUser(supabase: SupabaseAdminClient, userId: string): Promise<number> {
  // Need state vectors with cluster assignments
  const { data: vectors, error: vecErr } = await supabase
    .from('state_vectors')
    .select('id, date, cluster_id')
    .eq('user_id', userId)
    .not('cluster_id', 'is', null);

  if (vecErr || !vectors?.length) return 0;

  const totalDays = vectors.length;
  const clusterFreq: Record<string, number> = {};
  const dateToCluster: Record<string, string> = {};

  for (const v of vectors) {
    if (v.cluster_id) {
      clusterFreq[v.cluster_id] = (clusterFreq[v.cluster_id] ?? 0) + 1;
      dateToCluster[v.date] = v.cluster_id;
    }
  }

  const { data: entities, error: entErr } = await supabase
    .from('entities')
    .select('id, canonical_id, name, entity_type')
    .eq('user_id', userId)
    .limit(200);

  if (entErr || !entities?.length) return 0;

  let correlationsWritten = 0;

  for (const entity of entities) {
    const { data: mentions } = await supabase
      .from('memories')
      .select('date_bucket')
      .eq('user_id', userId)
      .contains('entities_extracted', [{ canonical_id: entity.canonical_id }])
      .not('date_bucket', 'is', null)
      .limit(100);

    if (!mentions?.length) continue;

    const clusterCoOccurrence: Record<string, number> = {};
    let matched = 0;
    for (const m of mentions) {
      const clusterId = dateToCluster[m.date_bucket];
      if (clusterId) {
        clusterCoOccurrence[clusterId] = (clusterCoOccurrence[clusterId] ?? 0) + 1;
        matched++;
      }
    }

    if (matched < 2) continue;

    for (const [clusterId, coCount] of Object.entries(clusterCoOccurrence)) {
      const pClusterGivenEntity = coCount / matched;
      const pCluster = (clusterFreq[clusterId] ?? 0) / totalDays;
      if (pCluster === 0) continue;

      const lift = Math.round((pClusterGivenEntity / pCluster) * 100) / 100;
      if (lift <= 1.2 || coCount < 2) continue;

      await supabase
        .from('entity_correlations')
        .upsert({
          user_id:     userId,
          entity_id:   entity.id,
          cluster_id:  clusterId,
          lift_score:  lift,
          sample_size: matched,
          computed_at: new Date().toISOString(),
        }, { onConflict: 'entity_id,cluster_id' });

      correlationsWritten++;
    }
  }

  console.log(`[EntityCorr] ✓ user=${userId.slice(0, 8)} correlations=${correlationsWritten}`);
  return correlationsWritten;
}
