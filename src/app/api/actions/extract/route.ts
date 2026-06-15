import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { createAdminClient } from '@/utils/supabase/admin';
import { invokeModel } from '@/services/ai/ai';

// Platforms that generate actionable tasks — noise excluded
const ACTIONABLE_PLATFORMS = [
  'gmail', 'google-calendar', 'github', 'linear',
  'trello', 'slack', 'notion', 'discord',
];

function isAuthorizedCron(request: Request): boolean {
  const expected = process.env.CRON_SECRET;
  if (!expected) return false;
  const auth = request.headers.get('authorization');
  return auth === `Bearer ${expected}`;
}

// Core extraction logic — reusable for both session and cron auth paths
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function extractForUser(userId: string, supabase: any, force = false) {
  // Check if extraction is needed (skip if run within last 25 minutes + no new memories)
  const { data: log } = await supabase
    .from('action_extraction_log')
    .select('last_run_at, memory_count')
    .eq('user_id', userId)
    .maybeSingle();

  const lastRunAt = log?.last_run_at ? new Date(log.last_run_at) : null;
  const minutesSinceLast = lastRunAt ? (Date.now() - lastRunAt.getTime()) / 60000 : Infinity;

  const { count: currentCount } = await supabase
    .from('memories')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .in('platform', ACTIONABLE_PLATFORMS);

  const prevCount = log?.memory_count ?? 0;
  const hasNewMemories = (currentCount ?? 0) > prevCount;

  if (!force && minutesSinceLast < 25 && !hasNewMemories) {
    console.log(`[ActionExtract] User ${userId.slice(0, 8)}: skipped — last run ${Math.round(minutesSinceLast)}m ago, no new memories.`);
    return { skipped: true, extracted: 0 };
  }


  // Fetch actionable memories — prioritized, noise-filtered
  const { data: memories, error } = await supabase
    .from('memories')
    .select('id, platform, event_type, title, content, timestamp, author')
    .eq('user_id', userId)
    .in('platform', ACTIONABLE_PLATFORMS)
    .not('content', 'is', null)
    .order('timestamp', { ascending: false })
    .limit(40);

  if (error) throw error;

  const memoryContext = (memories && memories.length > 0)
    ? memories.map((m: { platform: string; id: string; title?: string; content?: string }) =>
      `[${m.platform.toUpperCase()}] [${m.id}] ${m.title ?? ''}: ${(m.content ?? '').slice(0, 120)}`
    ).join('\n')
    : 'No actionable memories found.';

  // Get User Settings for Risk Sensitivity
  const { data: settingsData } = await supabase
    .from('connector_settings')
    .select('data_types')
    .eq('user_id', userId)
    .eq('platform', 'user_global')
    .maybeSingle();

  let riskSensitivity = 'MEDIUM';
  if (settingsData?.data_types?.[0]) {
    try {
      const parsedSettings = JSON.parse(settingsData.data_types[0]);
      if (parsedSettings.riskSensitivity) riskSensitivity = parsedSettings.riskSensitivity;
    } catch { }
  }

  let riskInstruction = '- Risk Sensitivity is MEDIUM. Extract clear actionable tasks and standard commitments.';
  if (riskSensitivity === 'LOW') {
    riskInstruction = '- Risk Sensitivity is LOW. Only extract massive, obvious tasks (like direct questions or explicit meeting invites). Ignore subtle follow-ups.';
  } else if (riskSensitivity === 'HIGH') {
    riskInstruction = '- Risk Sensitivity is HIGH. Be hyper-vigilant. Extract subtle tasks, passive-aggressive follow-ups, minor unresponded messages, and implied commitments.';
  }

  const prompt = `You are an action extraction assistant for EYES.
Read the recent user records and extract concrete actionable tasks (e.g. meeting requests, PR reviews, email replies, reminders).

Return ONLY a raw JSON object — no markdown, no explanation — in this exact format:
{"actions": [{"id":"unique_id","memoryId":"the_memory_id_from_brackets","platform":"platform","title":"short title","description":"brief context","suggestedAction":"what to do","actionType":"CALENDAR|LINEAR_TICKET|SLACK_REPLY|REMINDER|EMAIL_REPLY","method":"POST","confidence":85}]}

Rules:
- memoryId must be the exact id shown in [brackets] in the memory list
- confidence: 90+ = very clear action, 70-89 = probable, below 70 = skip
- Only include actions with confidence >= 70
- Maximum 10 actions
${riskInstruction}
- If no clear actions exist, return: {"actions": []}

Memories:
${memoryContext}`;

  let response = null;
  try {
    const aiResult = await invokeModel({
      capability: 'chat',
      preference: 'gemini',
      capture: false,
      system: 'You are a JSON extraction agent. Output only valid JSON, no markdown, no explanation.',
      messages: [{ role: 'user', content: prompt }]
    });
    response = typeof aiResult === 'string' ? aiResult : null;
  } catch (aiErr) {
    console.warn('[ActionExtract] AI call failed:', aiErr);
  }

  let parsed: { actions: Array<Record<string, unknown>> } = { actions: [] };
  if (response) {
    try {
      parsed = JSON.parse(response.trim());
    } catch {
      try {
        const match = response.match(/\{[\s\S]*\}/);
        if (match) parsed = JSON.parse(match[0]);
      } catch {
        console.warn('[ActionExtract] Could not parse AI response.');
      }
    }
  }

  const extractedActions = Array.isArray(parsed.actions) ? parsed.actions : [];

  // --- SECOND PASS: Vector Citation Chain ---
  // For each extracted action, find past commitments using Gemini embeddings
  if (extractedActions.length > 0) {
    for (const action of extractedActions) {
      try {
        const embedInput = `${action.title} ${action.description}`;
        const embedRes = await invokeModel({ capability: 'embed', messages: [{ role: 'user', content: embedInput }] });

        if (embedRes && typeof embedRes !== 'string' && 'embedding' in embedRes) {
          const { data: matches } = await supabase.rpc('match_memories', {
            query_embedding: embedRes.embedding,
            match_threshold: 0.25, // Lower threshold to catch nuanced history
            match_count: 3,
            user_id_arg: userId
          });

          if (matches && matches.length > 0) {
            const historyContext = matches.map((m: any) => `[${m.platform}] ${m.title || 'Event'}: ${m.content}`).join('\n');
            const synthesisPrompt = `You are building a citation chain for a task. 
Task: ${action.title} - ${action.description}
User's History:
${historyContext}

Write a 1-2 sentence description explaining the task AND citing the past commitment if it exists (e.g. "Valentin is asking about the deck. You promised it on April 17."). If the history is completely irrelevant, just return the original task description.
DO NOT use markdown or quotation marks.`;

            const synthesis = await invokeModel({
              capability: 'chat',
              preference: 'gemini',
              capture: false,
              messages: [{ role: 'user', content: synthesisPrompt }]
            });

            if (typeof synthesis === 'string' && synthesis.trim().length > 10) {
              action.description = synthesis.trim(); // Replace basic description with citation chain
            }
          }
        }
      } catch (e) {
        console.warn(`[ActionExtract] Citation chain failed for action ${action.id}:`, e);
      }
    }

    const { data: existing } = await supabase
      .from('action_queue')
      .select('memory_id, platform, title')
      .eq('user_id', userId)
      .eq('status', 'pending');

    const existingKeys = new Set(
      (existing ?? []).map((e: { memory_id: string; platform: string; title: string }) =>
        `${e.memory_id}:${e.platform}:${e.title}`
      )
    );

    const toInsert = extractedActions
      .filter(a => !existingKeys.has(`${a.memoryId}:${a.platform}:${a.title}`))
      .map(a => ({
        user_id: userId,
        memory_id: (a.memoryId as string) ?? null,
        platform: (a.platform as string) ?? 'unknown',
        title: (a.title as string) ?? 'Untitled Action',
        description: (a.description as string) ?? null,
        suggested_action: (a.suggestedAction as string) ?? null,
        action_type: (a.actionType as string) ?? 'REMINDER',
        method: (a.method as string) ?? 'POST',
        confidence: typeof a.confidence === 'number' ? Math.min(100, Math.max(0, a.confidence)) : 80,
        status: 'pending',
        extracted_at: new Date().toISOString(),
      }));

    if (toInsert.length > 0) {
      const { error: insertError } = await supabase.from('action_queue').insert(toInsert);
      if (insertError) console.error('[ActionExtract] Insert error:', insertError);
      else console.log(`[ActionExtract] Inserted ${toInsert.length} new actions for user ${userId.slice(0, 8)}`);
    }
  }

  // Update extraction log
  await supabase
    .from('action_extraction_log')
    .upsert({ user_id: userId, last_run_at: new Date().toISOString(), memory_count: currentCount ?? 0 }, { onConflict: 'user_id' });

  return { skipped: false, extracted: extractedActions.length };
}

/**
 * POST /api/actions/extract
 *
 * Two auth modes:
 *   1. CRON_SECRET Bearer token → uses admin client, runs for ALL users
 *   2. Session cookie (user in browser) → runs for current user only
 */
export async function POST(request: Request) {
  try {
    // ── Cron path: CRON_SECRET auth ────────────────────────────────────────
    if (isAuthorizedCron(request)) {
      const adminSupabase = createAdminClient();

      // Get all users with actionable memories
      const { data: userRows } = await adminSupabase
        .from('memories')
        .select('user_id')
        .in('platform', ACTIONABLE_PLATFORMS)
        .limit(1000);

      const userIds = [...new Set((userRows ?? []).map((r: { user_id: string }) => r.user_id))];
      console.log(`[ActionExtract] Cron: running for ${userIds.length} users.`);

      let totalExtracted = 0;
      for (const userId of userIds) {
        try {
          const result = await extractForUser(userId, adminSupabase);
          if (!result.skipped) totalExtracted += result.extracted;
        } catch (err) {
          console.error(`[ActionExtract] Failed for user ${userId.slice(0, 8)}:`, err);
        }
      }

      return NextResponse.json({ success: true, users: userIds.length, extracted: totalExtracted });
    }

    // ── User path: session cookie auth ─────────────────────────────────────
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const result = await extractForUser(user.id, supabase);
    return NextResponse.json({ success: true, ...result });

  } catch (error) {
    console.error('[ActionExtract] Fatal error:', error);
    return NextResponse.json({ error: 'Extraction failed' }, { status: 500 });
  }
}
