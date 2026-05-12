import { NextResponse } from 'next/server';
import { resolveSyncActor } from '@/utils/sync/actor';
import { upsertRawEventsSafely, upsertSyncStatusSafely } from '@/utils/supabase/upsert';
import { decryptToken, encryptToken } from '@/utils/tokens';

type StravaActivity = { id: number; name: string; type: string; sport_type?: string; distance?: number; moving_time?: number; elapsed_time?: number; total_elevation_gain?: number; average_heartrate?: number; max_heartrate?: number; start_date?: string; suffer_score?: number | null; achievement_count?: number };

function metersToKm(m?: number) { return m ? Math.round(m / 100) / 10 : 0; }
function secToMin(s?: number) { return s ? Math.round(s / 60) : 0; }

export async function POST(request: Request) {
  const actor = await resolveSyncActor(request);
  if ('status' in actor) return NextResponse.json({ error: actor.error }, { status: actor.status });
  const { supabase, userId } = actor;
  try {
    const { data: tokenRow } = await supabase.from('oauth_tokens').select('access_token,refresh_token,expires_at').eq('user_id', userId).eq('platform', 'strava').maybeSingle();
    if (!tokenRow?.access_token) return NextResponse.json({ error: 'Strava is not connected.' }, { status: 401 });
    const { data: currentStatus } = await supabase.from('sync_status').select('total_items').eq('user_id', userId).eq('platform', 'strava').maybeSingle();
    await upsertSyncStatusSafely(supabase, { user_id: userId, platform: 'strava', status: 'syncing', last_sync_at: new Date().toISOString() });

    // Refresh token if needed
    let accessToken = decryptToken(tokenRow.access_token);
    if (tokenRow.expires_at && new Date(tokenRow.expires_at).getTime() - Date.now() < 300000 && tokenRow.refresh_token) {
      const refreshResp = await fetch('https://www.strava.com/oauth/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ client_id: process.env.STRAVA_CLIENT_ID, client_secret: process.env.STRAVA_CLIENT_SECRET, refresh_token: decryptToken(tokenRow.refresh_token), grant_type: 'refresh_token' }),
      });
      if (refreshResp.ok) {
        const rb = await refreshResp.json();
        accessToken = rb.access_token;
        await supabase.from('oauth_tokens').update({ access_token: encryptToken(rb.access_token), refresh_token: rb.refresh_token ? encryptToken(rb.refresh_token) : tokenRow.refresh_token, expires_at: new Date(rb.expires_at * 1000).toISOString(), updated_at: new Date().toISOString() }).eq('user_id', userId).eq('platform', 'strava');
      }
    }

    const url = new URL(request.url);
    const limit = url.searchParams.get('depth') === 'deep' ? 200 : 30;
    const activitiesResp = await fetch(`https://www.strava.com/api/v3/athlete/activities?per_page=${limit}`, { headers: { Authorization: `Bearer ${accessToken}` }, cache: 'no-store' });
    if (!activitiesResp.ok) throw new Error(`Strava API (${activitiesResp.status})`);
    const activities = (await activitiesResp.json()) as StravaActivity[];

    const events: Record<string, unknown>[] = activities.map((act) => {
      const distKm = metersToKm(act.distance);
      const durationMin = secToMin(act.moving_time);
      const highIntensity = (act.suffer_score ?? 0) > 80 || (act.average_heartrate ?? 0) > 170;
      return {
        user_id: userId, platform: 'strava', platform_id: `activity_${act.id}`,
        event_type: 'activity', title: act.name || `${act.sport_type ?? act.type} activity`,
        content: [`${act.sport_type ?? act.type}: ${act.name}`, distKm > 0 ? `Distance: ${distKm}km` : '', durationMin > 0 ? `Duration: ${durationMin}min` : '', act.total_elevation_gain ? `Elevation: ${Math.round(act.total_elevation_gain)}m` : '', act.average_heartrate ? `Avg HR: ${Math.round(act.average_heartrate)}bpm` : ''].filter(Boolean).join(' | '),
        author: 'Strava', timestamp: act.start_date || new Date().toISOString(),
        is_flagged: highIntensity, flag_severity: highIntensity ? 'LOW' : 'LOW', flag_reason: highIntensity ? 'High intensity workout' : null,
        metadata: { activity_id: act.id, type: act.sport_type ?? act.type, distance_km: distKm, duration_min: durationMin, elevation_m: act.total_elevation_gain ?? 0, avg_hr: act.average_heartrate ?? null, suffer_score: act.suffer_score ?? null, achievements: act.achievement_count ?? 0 },
      };
    });

    if (events.length > 0) await upsertRawEventsSafely(supabase, events);
    const { count: totalMemories } = await supabase.from('memories').select('id', { count: 'exact', head: true }).eq('user_id', userId);
    const now = new Date().toISOString();
    await Promise.all([
      upsertSyncStatusSafely(supabase, { user_id: userId, platform: 'strava', status: 'connected', sync_progress: 100, total_items: (currentStatus?.total_items ?? 0) + events.length, last_sync_at: now, next_sync_at: new Date(Date.now() + 3600000).toISOString(), error_message: null }),
      supabase.from('user_profiles').update({ memories_indexed: totalMemories ?? events.length, updated_at: now }).eq('user_id', userId),
    ]);
    return NextResponse.json({ success: true, count: events.length });
  } catch (err) {
    console.error('[Strava Sync] Error:', err);
    await upsertSyncStatusSafely(supabase, { user_id: userId, platform: 'strava', status: 'error', error_message: String(err).slice(0, 200) });
    return NextResponse.json({ error: 'Strava sync failed' }, { status: 500 });
  }
}
