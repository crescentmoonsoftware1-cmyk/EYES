import { NextResponse } from 'next/server';
import { resolveSyncActor } from '@/utils/sync/actor';
import { upsertRawEventsSafely, upsertSyncStatusSafely } from '@/utils/supabase/upsert';
import { decryptToken, encryptToken } from '@/services/auth/tokens';

export async function POST(request: Request) {
  const actor = await resolveSyncActor(request);
  if ('status' in actor) return NextResponse.json({ error: actor.error }, { status: actor.status });
  const { supabase, userId } = actor;
  try {
    const { data: tokenRow } = await supabase.from('oauth_tokens').select('access_token,refresh_token,expires_at').eq('user_id', userId).eq('platform', 'withings').maybeSingle();
    if (!tokenRow?.access_token) return NextResponse.json({ error: 'Withings is not connected.' }, { status: 401 });
    const { data: currentStatus } = await supabase.from('sync_status').select('total_items').eq('user_id', userId).eq('platform', 'withings').maybeSingle();
    await upsertSyncStatusSafely(supabase, { user_id: userId, platform: 'withings', status: 'syncing', last_sync_at: new Date().toISOString() });

    // Token refresh (Withings tokens expire in 3 hours)
    let accessToken = decryptToken(tokenRow.access_token) || '';
    if (tokenRow.expires_at && new Date(tokenRow.expires_at).getTime() - Date.now() < 300000 && tokenRow.refresh_token) {
      const refreshResp = await fetch('https://wbsapi.withings.net/v2/oauth2', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ action: 'requesttoken', grant_type: 'refresh_token', client_id: process.env.WITHINGS_CLIENT_ID!, client_secret: process.env.WITHINGS_CLIENT_SECRET!, refresh_token: decryptToken(tokenRow.refresh_token) || '' }),
      });
      if (refreshResp.ok) {
        const rb = (await refreshResp.json()).body;
        if (rb?.access_token) {
          accessToken = rb.access_token;
          await supabase.from('oauth_tokens').update({ access_token: encryptToken(rb.access_token), refresh_token: rb.refresh_token ? encryptToken(rb.refresh_token) : tokenRow.refresh_token, expires_at: rb.expires_in ? new Date(Date.now() + rb.expires_in * 1000).toISOString() : null, updated_at: new Date().toISOString() }).eq('user_id', userId).eq('platform', 'withings');
        }
      }
    }

    const startDate = Math.floor((Date.now() - 30 * 24 * 60 * 60 * 1000) / 1000);
    const endDate = Math.floor(Date.now() / 1000);

    // Fetch weight/body measurements (meastypes: 1=weight, 6=fat%, 76=muscle mass)
    const measureResp = await fetch('https://wbsapi.withings.net/measure', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Authorization: `Bearer ${accessToken}` },
      body: new URLSearchParams({ action: 'getmeas', meastypes: '1,6,76', category: '1', startdate: String(startDate), enddate: String(endDate) }),
    });

    // Fetch sleep summary
    const sleepResp = await fetch('https://wbsapi.withings.net/v2/sleep', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Authorization: `Bearer ${accessToken}` },
      body: new URLSearchParams({ action: 'getsummary', startdateymd: new Date(startDate * 1000).toISOString().slice(0, 10), enddateymd: new Date(endDate * 1000).toISOString().slice(0, 10), data_fields: 'breathing_disturbances_intensity,durationtosleep,durationtowakeup,sleep_score,snoring,snoringepisodecount,night_events' }),
    });

    const events: Record<string, unknown>[] = [];
    if (measureResp.ok) {
      const mData = (await measureResp.json()).body;
      for (const grp of (mData?.measuregrps ?? [])) {
        const weight = grp.measures?.find((m: Record<string, number>) => m.type === 1);
        const fatPct = grp.measures?.find((m: Record<string, number>) => m.type === 6);
        const weightKg = weight ? Math.round(weight.value * Math.pow(10, weight.unit) * 10) / 10 : null;
        const fatPctVal = fatPct ? Math.round(fatPct.value * Math.pow(10, fatPct.unit) * 10) / 10 : null;
        events.push({
          user_id: userId, platform: 'withings', platform_id: `measure_${grp.grpid}`,
          event_type: 'measurement', title: 'Withings Body Measurement',
          content: [weightKg ? `Weight: ${weightKg}kg` : '', fatPctVal ? `Body Fat: ${fatPctVal}%` : ''].filter(Boolean).join(' | ') || 'Body measurement recorded',
          author: 'Withings', timestamp: new Date(grp.date * 1000).toISOString(),
          is_flagged: false, flag_severity: 'LOW', flag_reason: null,
          metadata: { grp_id: grp.grpid, weight_kg: weightKg, body_fat_pct: fatPctVal },
        });
      }
    }

    if (sleepResp.ok) {
      const sData = (await sleepResp.json()).body;
      for (const s of (sData?.series ?? [])) {
        const score = s.data?.sleep_score ?? 0;
        const poorSleep = score > 0 && score < 60;
        events.push({
          user_id: userId, platform: 'withings', platform_id: `sleep_${s.startdate}`,
          event_type: 'sleep', title: `Sleep: ${new Date(s.startdate * 1000).toISOString().slice(0, 10)}`,
          content: [`Score: ${score || 'N/A'}`, s.data?.durationtosleep ? `Time to sleep: ${Math.round(s.data.durationtosleep / 60)}min` : '', s.data?.snoring ? `Snoring: ${Math.round(s.data.snoring / 60)}min` : ''].filter(Boolean).join(' | '),
          author: 'Withings', timestamp: new Date(s.startdate * 1000).toISOString(),
          is_flagged: poorSleep, flag_severity: poorSleep ? 'LOW' : 'LOW', flag_reason: poorSleep ? 'Low sleep score' : null,
          metadata: { score, snoring_min: s.data?.snoring ? Math.round(s.data.snoring / 60) : 0, breathing_disturbances: s.data?.breathing_disturbances_intensity ?? 0 },
        });
      }
    }

    if (events.length > 0) await upsertRawEventsSafely(supabase, events);
    const { count: totalMemories } = await supabase.from('memories').select('id', { count: 'exact', head: true }).eq('user_id', userId);
    const now = new Date().toISOString();
    await Promise.all([
      upsertSyncStatusSafely(supabase, { user_id: userId, platform: 'withings', status: 'connected', sync_progress: 100, total_items: (currentStatus?.total_items ?? 0) + events.length, last_sync_at: now, next_sync_at: new Date(Date.now() + 3600000).toISOString(), error_message: null }),
      supabase.from('user_profiles').update({ memories_indexed: totalMemories ?? events.length, updated_at: now }).eq('user_id', userId),
    ]);
    return NextResponse.json({ success: true, count: events.length });
  } catch (err) {
    console.error('[Withings Sync] Error:', err);
    await upsertSyncStatusSafely(supabase, { user_id: userId, platform: 'withings', status: 'error', error_message: String(err).slice(0, 200) });
    return NextResponse.json({ error: 'Withings sync failed' }, { status: 500 });
  }
}
