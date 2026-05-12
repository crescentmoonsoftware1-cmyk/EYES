import { NextResponse } from 'next/server';

import { getValidGoogleToken } from '@/utils/oauth';
import { upsertRawEventsSafely, upsertSyncStatusSafely } from '@/utils/supabase/upsert';
import { resolveSyncActor } from '@/utils/sync/actor';

type CalendarEventsResponse = {
  items?: Array<{
    id: string;
    summary?: string;
    description?: string;
    creator?: { email?: string };
    start?: { dateTime?: string; date?: string };
    end?: { dateTime?: string; date?: string };
    htmlLink?: string;
  }>;
};

export async function POST(request: Request) {
  try {
    const actor = await resolveSyncActor(request);
    if ('status' in actor) {
      return NextResponse.json({ error: actor.error }, { status: actor.status });
    }

    const { supabase, userId } = actor;

    // 1. Get existing sync status to find the cursor
    const { data: currentStatus } = await supabase
      .from('sync_status')
      .select('cursor, total_items')
      .eq('user_id', userId)
      .eq('platform', 'google_calendar')
      .maybeSingle();

    const accessToken = await getValidGoogleToken(supabase, userId, 'google_calendar');
    if (!accessToken) {
      return NextResponse.json({ error: 'Google Calendar session expired and refresh failed.' }, { status: 401 });
    }

    const url = new URL(request.url);
    const depth = url.searchParams.get('depth') || 'shallow';
    const maxResults = depth === 'deep' ? 500 : 50;
    const historyDays = depth === 'deep' ? 1095 : 180; // 3 years vs 6 months
    const timeMin = new Date(Date.now() - 1000 * 60 * 60 * 24 * historyDays).toISOString();

    // Mark as 'syncing'
    await upsertSyncStatusSafely(supabase, {
      user_id: userId,
      platform: 'google_calendar',
      status: 'syncing',
      last_sync_at: new Date().toISOString(),
    });

    let allEvents: any[] = [];
    let nextPageToken: string | undefined = currentStatus?.cursor || undefined;
    let hasMore = true;

    // --- PAGINATION LOOP ---
    // Fetch a batch of events
    const fetchUrl = new URL('https://www.googleapis.com/calendar/v3/calendars/primary/events');
    fetchUrl.searchParams.set('maxResults', maxResults.toString());
    fetchUrl.searchParams.set('singleEvents', 'true');
    fetchUrl.searchParams.set('orderBy', 'startTime');
    fetchUrl.searchParams.set('timeMin', timeMin);
    if (nextPageToken) fetchUrl.searchParams.set('pageToken', nextPageToken);

    const response = await fetch(fetchUrl.toString(), {
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: 'no-store',
    });

    if (!response.ok) {
      const providerError = await response.text();
      return NextResponse.json({ 
        error: `Calendar API failed (${response.status})`, 
        detail: providerError.slice(0, 300) 
      }, { status: 502 });
    }

    const body = (await response.json()) as { items?: any[], nextPageToken?: string };
    allEvents = body.items ?? [];
    nextPageToken = body.nextPageToken;
    hasMore = !!nextPageToken;

    const events = allEvents.map((item) => {
      const title = item.summary || 'Untitled event';
      const description = item.description || '';
      const ts = item.start?.dateTime || item.start?.date || new Date().toISOString();
      const content = `${title} ${description}`.trim();
      const isFlagged = /interview|confidential|medical|legal/i.test(content);

      return {
        user_id: userId,
        platform: 'google_calendar',
        platform_id: item.id,
        event_type: 'calendar_event',
        title,
        content,
        author: item.creator?.email || 'Google Calendar',
        timestamp: new Date(ts).toISOString(),
        metadata: {
          start: item.start,
          end: item.end,
          htmlLink: item.htmlLink,
        },
        is_flagged: isFlagged,
        flag_severity: isFlagged ? 'LOW' : 'LOW',
        flag_reason: isFlagged ? 'Potentially sensitive calendar event' : null,
      };
    });

    await upsertRawEventsSafely(supabase, events);

    const { count: totalMemories } = await supabase
      .from('memories')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId);

    // Update status and save cursor
    const [, profileUpdate] = await Promise.all([
      upsertSyncStatusSafely(supabase, {
        user_id: userId,
        platform: 'google_calendar',
        status: hasMore ? 'syncing' : 'connected',
        sync_progress: hasMore ? 50 : 100,
        total_items: (currentStatus?.total_items || 0) + events.length,
        last_sync_at: new Date().toISOString(),
        next_sync_at: new Date(Date.now() + 1000 * 60 * 30).toISOString(),
        cursor: hasMore ? nextPageToken : null,
        error_message: null,
      }),
      supabase.from('user_profiles').update({
        memories_indexed: totalMemories ?? events.length,
        updated_at: new Date().toISOString(),
      }).eq('user_id', userId),
    ]);

    if (profileUpdate.error) throw profileUpdate.error;

    return NextResponse.json({ 
      ok: true, 
      syncedEvents: events.length,
      totalMemories,
      hasMore 
    });
  } catch (error) {
    console.error('google-calendar sync error:', error);
    return NextResponse.json({ error: 'Unable to sync Google Calendar data right now.' }, { status: 500 });
  }
}
