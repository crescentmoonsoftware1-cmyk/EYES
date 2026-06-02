import { NextResponse } from 'next/server';
import { resolveSyncActor } from '@/utils/sync/actor';
import { upsertSyncStatusSafely } from '@/utils/supabase/upsert';
export async function POST(request: Request) {
  const actor = await resolveSyncActor(request);
  if ('status' in actor) return NextResponse.json({ error: actor.error }, { status: actor.status });
  const { supabase, userId } = actor;
  try {
    await upsertSyncStatusSafely(supabase, { user_id: userId, platform: 'gcp', status: 'syncing', last_sync_at: new Date().toISOString() });
    // TODO: Implement actual data fetching and indexing logic for GCP
    await upsertSyncStatusSafely(supabase, { user_id: userId, platform: 'gcp', status: 'connected', sync_progress: 100, last_sync_at: new Date().toISOString(), next_sync_at: new Date(Date.now() + 3600000).toISOString(), error_message: null });
    return NextResponse.json({ success: true, count: 0 });
  } catch (err) {
    console.error('[GCP Sync] Error:', err);
    await upsertSyncStatusSafely(supabase, { user_id: userId, platform: 'gcp', status: 'error', error_message: String(err).slice(0, 200) });
    return NextResponse.json({ error: 'GCP sync failed' }, { status: 500 });
  }
}