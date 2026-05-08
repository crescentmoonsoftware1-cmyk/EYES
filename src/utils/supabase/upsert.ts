import type { SupabaseClient } from '@supabase/supabase-js';

type PostgrestErrorLike = {
  code?: string;
  message?: string;
};

const MISSING_CONFLICT_CONSTRAINT_CODE = '42P10';

function hasMissingConflictConstraint(error: PostgrestErrorLike | null) {
  return error?.code === MISSING_CONFLICT_CONSTRAINT_CODE;
}

function eventIdentityKey(event: RawEventUpsertRow) {
  return `${event.user_id}::${event.platform}::${event.platform_id}`;
}

export type RawEventUpsertRow = {
  user_id: string;
  platform: string;
  platform_id: string;
  event_type: string;
  title: string;
  content: string;
  author: string;
  timestamp: string;
  metadata: Record<string, unknown>;
  is_flagged: boolean;
  flag_severity: string | null;
  flag_reason: string | null;
};

export type SyncStatusUpsertRow = {
  user_id: string;
  platform: string;
  status?: string;
  sync_progress?: number;
  total_items?: number;
  last_sync_at?: string;
  next_sync_at?: string;
  error_message?: string | null;
  cursor?: string | null;
  metadata?: Record<string, unknown>;
};

export async function upsertRawEventsSafely(supabase: SupabaseClient, events: RawEventUpsertRow[]) {
  if (events.length === 0) {
    return;
  }

  const dedupedEvents = Array.from(new Map(events.map((event) => [eventIdentityKey(event), event])).values());

  const { error: upsertError } = await supabase
    .from('raw_events')
    .upsert(dedupedEvents, { onConflict: 'user_id,platform,platform_id' });

  if (!upsertError) {
    return;
  }

  if (!hasMissingConflictConstraint(upsertError)) {
    throw upsertError;
  }

  console.warn(
    '[DB] raw_events upsert fallback activated because ON CONFLICT constraint is missing. Apply latest migrations.'
  );

  const groupedIds = new Map<string, { userId: string; platform: string; ids: string[] }>();

  dedupedEvents.forEach((event) => {
    const groupKey = `${event.user_id}::${event.platform}`;
    const group = groupedIds.get(groupKey);
    if (!group) {
      groupedIds.set(groupKey, {
        userId: event.user_id,
        platform: event.platform,
        ids: [event.platform_id],
      });
      return;
    }

    group.ids.push(event.platform_id);
  });

  for (const group of groupedIds.values()) {
    const uniqueIds = Array.from(new Set(group.ids));
    if (uniqueIds.length === 0) {
      continue;
    }

    const { error: deleteError } = await supabase
      .from('raw_events')
      .delete()
      .eq('user_id', group.userId)
      .eq('platform', group.platform)
      .in('platform_id', uniqueIds);

    if (deleteError) {
      throw deleteError;
    }
  }

  const { error: insertError } = await supabase.from('raw_events').insert(dedupedEvents);
  if (insertError) {
    throw insertError;
  }
}

export async function upsertSyncStatusSafely(supabase: SupabaseClient, syncStatus: SyncStatusUpsertRow) {
  const { error: upsertError } = await supabase
    .from('sync_status')
    .upsert(syncStatus, { onConflict: 'user_id,platform' });

  if (!upsertError) return;

  if (!hasMissingConflictConstraint(upsertError)) {
    console.error(`[DB Error] Sync status upsert failed: ${upsertError.message}`);
    throw upsertError;
  }

  // Fallback for missing constraints
  const { error: updateError } = await supabase
    .from('sync_status')
    .update(syncStatus)
    .eq('user_id', syncStatus.user_id)
    .eq('platform', syncStatus.platform);

  if (updateError) throw updateError;
}

/**
 * Batch upsert multiple sync status rows in a single operation.
 * Significantly reduces database load compared to individual upserts.
 * Work Item #4: Status Table Write Batching
 */
export async function batchUpsertSyncStatus(supabase: SupabaseClient, statuses: SyncStatusUpsertRow[]) {
  if (statuses.length === 0) return;

  // Deduplicate by user_id+platform composite key (keep last)
  const dedupedMap = new Map<string, SyncStatusUpsertRow>();
  for (const status of statuses) {
    const key = `${status.user_id}::${status.platform}`;
    dedupedMap.set(key, status);
  }

  const dedupedStatuses = Array.from(dedupedMap.values());

  try {
    const { error: upsertError } = await supabase
      .from('sync_status')
      .upsert(dedupedStatuses, { onConflict: 'user_id,platform' });

    if (!upsertError) return;

    if (!hasMissingConflictConstraint(upsertError)) {
      console.error(`[DB Error] Batch sync status upsert failed: ${upsertError.message}`);
      throw upsertError;
    }

    // Fallback: individual updates if batch fails
    console.warn('[DB] Batch sync status upsert failed, falling back to individual updates');
    for (const status of dedupedStatuses) {
      await upsertSyncStatusSafely(supabase, status);
    }
  } catch (error) {
    console.error('[DB] Batch status upsert error:', error);
    throw error;
  }
}
