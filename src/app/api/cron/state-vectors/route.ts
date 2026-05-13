import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { invokeModel } from '@/services/ai/ai';

// ─── Types ────────────────────────────────────────────────────────────────────
type MemoryRow = {
  platform: string;
  content: string;
  content_type?: string;
  timestamp?: string;
  metadata?: Record<string, unknown>;
  author?: string;
};

const SERVICE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const CRON_SECRET = process.env.CRON_SECRET;

// ─── Main cron handler ────────────────────────────────────────────────────────
export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization');
  if (CRON_SECRET && authHeader !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createClient(SERVICE_URL, SERVICE_KEY, {
    auth: { persistSession: false },
  });

  // Target date = yesterday (we compute after the day is complete)
  const yesterday = new Date();
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  const dateStr = yesterday.toISOString().split('T')[0]; // YYYY-MM-DD

  console.log(`[StateVectors] Computing vectors for date: ${dateStr}`);

  // Get all distinct users who have memories for yesterday
  const { data: userRows, error: userErr } = await supabase
    .from('memories')
    .select('user_id')
    .eq('date_bucket', dateStr)
    .eq('excluded_from_chronic', false);

  if (userErr) {
    console.error('[StateVectors] Failed to fetch users:', userErr);
    return NextResponse.json({ error: userErr.message }, { status: 500 });
  }

  const userIds = [...new Set((userRows ?? []).map((r: { user_id: string }) => r.user_id))];
  console.log(`[StateVectors] Processing ${userIds.length} users for ${dateStr}`);

  let processed = 0;
  let failed = 0;

  for (const userId of userIds) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await computeStateVector(supabase as any, userId, dateStr);
      processed++;
    } catch (err) {
      console.error(`[StateVectors] Failed for user ${userId}:`, err);
      failed++;
    }
  }

  return NextResponse.json({ date: dateStr, processed, failed });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function computeStateVector(
  supabase: any,
  userId: string,
  date: string
) {
  const { data: memories, error } = await supabase
    .from('memories')
    .select('platform, content, content_type, timestamp, metadata, author')
    .eq('user_id', userId)
    .eq('date_bucket', date)
    .eq('excluded_from_chronic', false)
    .limit(500);

  if (error || !memories || memories.length === 0) return;

  const messageVolume = memories.length;

  // Platform mix
  const platformCounts: Record<string, number> = {};
  for (const m of memories as MemoryRow[]) {
    platformCounts[m.platform] = (platformCounts[m.platform] ?? 0) + 1;
  }
  const platformMix: Record<string, number> = {};
  for (const [p, count] of Object.entries(platformCounts)) {
    platformMix[p] = Math.round((count / messageVolume) * 100) / 100;
  }
  const dominantPlatform = Object.entries(platformCounts)
    .sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

  // Social breadth — distinct authors
  const authors = new Set(
    (memories as MemoryRow[]).map(m => m.author).filter(Boolean)
  );
  const socialBreadth = authors.size;

  // Output cadence — ratio of outbound messages
  const outboundCount = (memories as MemoryRow[]).filter(
    m => m.metadata?.['is_outbound'] === true
  ).length;
  const outputCadence = Math.round((outboundCount / messageVolume) * 100) / 100;

  // Time of day bias — 0=morning-heavy, 1=night-heavy
  const hours = (memories as MemoryRow[])
    .map(m => m.timestamp ? new Date(m.timestamp).getUTCHours() : null)
    .filter((h): h is number => h !== null);
  const avgHour = hours.length > 0 ? hours.reduce((a, b) => a + b, 0) / hours.length : 12;
  const timeOfDayBias = Math.round((avgHour / 23) * 100) / 100;

  // AI — extract dominant topic, topic entropy, sentiment
  let dominantTopic: string | null = null;
  let topicEntropy = 0.5;
  let sentimentScore = 0;

  try {
    const sample = (memories as MemoryRow[])
      .slice(0, 20)
      .map(m => m.content.slice(0, 200))
      .join('\n---\n');

    const aiResponse = await invokeModel({
      capability: 'classify',
      system: 'You are a behavioral analytics engine. Respond with valid JSON only, no markdown.',
      messages: [{
        role: 'user',
        content: `Analyze these ${messageVolume} messages from a single day. Return exactly:
{"dominant_topic":"2-4 word label","topic_entropy":0.5,"sentiment_score":0.0}

Messages:
${sample}`,
      }],
      preference: 'auto',
      capture: false,
    });

    if (aiResponse) {
      const jsonMatch = String(aiResponse).match(/\{[\s\S]*?\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        dominantTopic  = parsed.dominant_topic ?? null;
        topicEntropy   = Math.max(0, Math.min(1, Number(parsed.topic_entropy) || 0.5));
        sentimentScore = Math.max(-1, Math.min(1, Number(parsed.sentiment_score) || 0));
      }
    }
  } catch {
    // Defaults already set
  }

  // Upsert the state vector
  const { error: upsertErr } = await supabase
    .from('state_vectors')
    .upsert({
      user_id:           userId,
      date:              date,
      message_volume:    messageVolume,
      output_cadence:    outputCadence,
      sentiment_score:   sentimentScore,
      topic_entropy:     topicEntropy,
      query_depth:       0,
      social_breadth:    socialBreadth,
      platform_mix:      platformMix,
      time_of_day_bias:  timeOfDayBias,
      dominant_platform: dominantPlatform,
      dominant_topic:    dominantTopic,
      computed_at:       new Date().toISOString(),
    }, { onConflict: 'user_id,date' });

  if (upsertErr) throw new Error(`state_vectors upsert: ${upsertErr.message}`);

  console.log(`[StateVectors] ✓ user=${userId.slice(0, 8)} date=${date} vol=${messageVolume}`);
}
