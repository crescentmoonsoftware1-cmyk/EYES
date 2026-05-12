import { NextResponse } from 'next/server';
import { resolveSyncActor } from '@/utils/sync/actor';
import { upsertRawEventsSafely, upsertSyncStatusSafely } from '@/utils/supabase/upsert';

type PostHogEvent = {
  id: string; event: string; timestamp: string;
  distinct_id?: string; properties?: Record<string, unknown>;
};
type PostHogEventsResponse = { results?: PostHogEvent[]; next?: string | null };

export async function POST(request: Request) {
  const actor = await resolveSyncActor(request);
  if ('status' in actor) return NextResponse.json({ error: actor.error }, { status: actor.status });
  const { supabase, userId } = actor;

  const apiKey = process.env.POSTHOG_API_KEY;
  if (!apiKey) return NextResponse.json({ error: 'POSTHOG_API_KEY not configured.' }, { status: 503 });

  try {
    const { data: currentStatus } = await supabase
      .from('sync_status').select('total_items, cursor').eq('user_id', userId).eq('platform', 'posthog').maybeSingle();

    await upsertSyncStatusSafely(supabase, { user_id: userId, platform: 'posthog', status: 'syncing', last_sync_at: new Date().toISOString() });

    const url = new URL(request.url);
    const limit = url.searchParams.get('depth') === 'deep' ? 500 : 100;

    // PostHog project events API (works with project API key)
    const fetchUrl = new URL('https://app.posthog.com/api/projects/@current/events/');
    fetchUrl.searchParams.set('limit', String(limit));
    fetchUrl.searchParams.set('orderBy', '-timestamp');
    if (currentStatus?.cursor) fetchUrl.searchParams.set('after', currentStatus.cursor);

    const resp = await fetch(fetchUrl.toString(), {
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      cache: 'no-store',
    });

    if (!resp.ok) throw new Error(`PostHog API (${resp.status}): ${(await resp.text()).slice(0, 200)}`);
    const body = (await resp.json()) as PostHogEventsResponse;
    const phEvents = body.results ?? [];

    const events: Record<string, unknown>[] = phEvents.map((ev) => {
      const isCrash = ev.event === '$exception' || ev.event === 'Application Crashed';
      const isError = ev.event.toLowerCase().includes('error') || ev.event.toLowerCase().includes('fail');
      const flagged = isCrash || isError;
      return {
        user_id: userId, platform: 'posthog', platform_id: ev.id,
        event_type: ev.event,
        title: `PostHog: ${ev.event}`,
        content: `Event: ${ev.event} | User: ${ev.distinct_id ?? 'anonymous'} | ${new Date(ev.timestamp).toLocaleDateString()}`,
        author: ev.distinct_id ?? 'anonymous',
        timestamp: new Date(ev.timestamp).toISOString(),
        is_flagged: flagged, flag_severity: isCrash ? 'HEAVY' : flagged ? 'DIRECT' : 'LOW',
        flag_reason: isCrash ? 'App crash/exception detected' : isError ? 'Error event detected' : null,
        metadata: { event_type: ev.event, distinct_id: ev.distinct_id, properties: ev.properties ?? {} },
      };
    });

    if (events.length > 0) await upsertRawEventsSafely(supabase, events);

    // Use newest event timestamp as cursor for next sync
    const newestTs = phEvents[0]?.timestamp ?? null;
    const { count: totalMemories } = await supabase.from('memories').select('id', { count: 'exact', head: true }).eq('user_id', userId);
    const now = new Date().toISOString();
    await Promise.all([
      upsertSyncStatusSafely(supabase, { user_id: userId, platform: 'posthog', status: 'connected', sync_progress: 100, total_items: (currentStatus?.total_items ?? 0) + events.length, last_sync_at: now, next_sync_at: new Date(Date.now() + 3600000).toISOString(), cursor: newestTs, error_message: null }),
      supabase.from('user_profiles').update({ memories_indexed: totalMemories ?? events.length, updated_at: now }).eq('user_id', userId),
    ]);

    return NextResponse.json({ success: true, count: events.length });
  } catch (err) {
    console.error('[PostHog Sync] Error:', err);
    await upsertSyncStatusSafely(supabase, { user_id: userId, platform: 'posthog', status: 'error', error_message: String(err).slice(0, 200) });
    return NextResponse.json({ error: 'PostHog sync failed' }, { status: 500 });
  }
}
