import { NextResponse } from 'next/server';
import { resolveSyncActor } from '@/utils/sync/actor';
import { upsertRawEventsSafely, upsertSyncStatusSafely } from '@/utils/supabase/upsert';
import { decryptToken, encryptToken } from '@/utils/tokens';

type FitbitActivity = { logId: number; activityName?: string; activityTypeId?: number; calories?: number; steps?: number; distance?: number; duration?: number; averageHeartRate?: number; startTime?: string; originalStartTime?: string };
type FitbitSleepSummary = { dateOfSleep?: string; duration?: number; efficiency?: number; minutesAsleep?: number; minutesAwake?: number; startTime?: string };

export async function POST(request: Request) {
  const actor = await resolveSyncActor(request);
  if ('status' in actor) return NextResponse.json({ error: actor.error }, { status: actor.status });
  const { supabase, userId } = actor;
  try {
    const { data: tokenRow } = await supabase.from('oauth_tokens').select('access_token,refresh_token,expires_at').eq('user_id', userId).eq('platform', 'fitbit').maybeSingle();
    if (!tokenRow?.access_token) return NextResponse.json({ error: 'Fitbit is not connected.' }, { status: 401 });
    const { data: currentStatus } = await supabase.from('sync_status').select('total_items').eq('user_id', userId).eq('platform', 'fitbit').maybeSingle();
    await upsertSyncStatusSafely(supabase, { user_id: userId, platform: 'fitbit', status: 'syncing', last_sync_at: new Date().toISOString() });

    // Token refresh
    let accessToken = decryptToken(tokenRow.access_token);
    if (tokenRow.expires_at && new Date(tokenRow.expires_at).getTime() - Date.now() < 300000 && tokenRow.refresh_token) {
      const basicAuth = Buffer.from(`${process.env.FITBIT_CLIENT_ID}:${process.env.FITBIT_CLIENT_SECRET}`).toString('base64');
      const refreshResp = await fetch('https://api.fitbit.com/oauth2/token', {
        method: 'POST',
        headers: { Authorization: `Basic ${basicAuth}`, 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: decryptToken(tokenRow.refresh_token) }),
      });
      if (refreshResp.ok) {
        const rb = await refreshResp.json();
        accessToken = rb.access_token;
        await supabase.from('oauth_tokens').update({ access_token: encryptToken(rb.access_token), refresh_token: rb.refresh_token ? encryptToken(rb.refresh_token) : tokenRow.refresh_token, expires_at: rb.expires_in ? new Date(Date.now() + rb.expires_in * 1000).toISOString() : null, updated_at: new Date().toISOString() }).eq('user_id', userId).eq('platform', 'fitbit');
      }
    }

    const headers = { Authorization: `Bearer ${accessToken}` };
    const today = new Date().toISOString().slice(0, 10);
    const monthAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

    const [activitiesResp, sleepResp] = await Promise.all([
      fetch(`https://api.fitbit.com/1/user/-/activities/list.json?afterDate=${monthAgo}&sort=desc&offset=0&limit=50`, { headers, cache: 'no-store' }),
      fetch(`https://api.fitbit.com/1.2/user/-/sleep/list.json?afterDate=${monthAgo}&sort=desc&offset=0&limit=20`, { headers, cache: 'no-store' }),
    ]);

    const activities: FitbitActivity[] = activitiesResp.ok ? ((await activitiesResp.json()).activities ?? []) : [];
    const sleepLogs: FitbitSleepSummary[] = sleepResp.ok ? ((await sleepResp.json()).sleep ?? []) : [];

    const events: Record<string, unknown>[] = [
      ...activities.map((act) => ({
        user_id: userId, platform: 'fitbit', platform_id: `activity_${act.logId}`,
        event_type: 'activity', title: act.activityName || 'Fitbit Activity',
        content: [`Activity: ${act.activityName}`, act.steps ? `Steps: ${act.steps}` : '', act.calories ? `Calories: ${act.calories}` : '', act.distance ? `Distance: ${Math.round(act.distance * 10) / 10}km` : '', act.averageHeartRate ? `Avg HR: ${act.averageHeartRate}bpm` : ''].filter(Boolean).join(' | '),
        author: 'Fitbit', timestamp: act.originalStartTime || act.startTime || today,
        is_flagged: false, flag_severity: 'LOW', flag_reason: null,
        metadata: { log_id: act.logId, steps: act.steps, calories: act.calories, distance_km: act.distance, duration_ms: act.duration, avg_hr: act.averageHeartRate },
      })),
      ...sleepLogs.map((sl) => {
        const efficiency = sl.efficiency ?? 0;
        const poorSleep = efficiency < 70;
        return {
          user_id: userId, platform: 'fitbit', platform_id: `sleep_${sl.dateOfSleep}`,
          event_type: 'sleep', title: `Sleep: ${sl.dateOfSleep}`,
          content: [`Sleep on ${sl.dateOfSleep}`, sl.minutesAsleep ? `Asleep: ${sl.minutesAsleep}min` : '', sl.minutesAwake ? `Awake: ${sl.minutesAwake}min` : '', `Efficiency: ${efficiency}%`].filter(Boolean).join(' | '),
          author: 'Fitbit', timestamp: sl.startTime || sl.dateOfSleep || today,
          is_flagged: poorSleep, flag_severity: poorSleep ? 'LOW' : 'LOW', flag_reason: poorSleep ? 'Low sleep efficiency' : null,
          metadata: { date: sl.dateOfSleep, duration_ms: sl.duration, efficiency, minutes_asleep: sl.minutesAsleep, minutes_awake: sl.minutesAwake },
        };
      }),
    ];

    if (events.length > 0) await upsertRawEventsSafely(supabase, events);
    const { count: totalMemories } = await supabase.from('memories').select('id', { count: 'exact', head: true }).eq('user_id', userId);
    const now = new Date().toISOString();
    await Promise.all([
      upsertSyncStatusSafely(supabase, { user_id: userId, platform: 'fitbit', status: 'connected', sync_progress: 100, total_items: (currentStatus?.total_items ?? 0) + events.length, last_sync_at: now, next_sync_at: new Date(Date.now() + 3600000).toISOString(), error_message: null }),
      supabase.from('user_profiles').update({ memories_indexed: totalMemories ?? events.length, updated_at: now }).eq('user_id', userId),
    ]);
    return NextResponse.json({ success: true, activities: activities.length, sleep: sleepLogs.length, count: events.length });
  } catch (err) {
    console.error('[Fitbit Sync] Error:', err);
    await upsertSyncStatusSafely(supabase, { user_id: userId, platform: 'fitbit', status: 'error', error_message: String(err).slice(0, 200) });
    return NextResponse.json({ error: 'Fitbit sync failed' }, { status: 500 });
  }
}
