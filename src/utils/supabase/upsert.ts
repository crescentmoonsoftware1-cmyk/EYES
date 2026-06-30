import type { SupabaseClient } from '@supabase/supabase-js';
import { classifyContentType, processAcuteDetection } from '@/services/acute/detection';

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

export async function upsertRawEventsSafely(supabase: SupabaseClient, events: Record<string, unknown>[]) {
  if (events.length === 0) {
    return;
  }

  // Cast to typed rows — field shapes are enforced by construction in every sync route.
  const dedupedEvents = Array.from(
    new Map((events as RawEventUpsertRow[]).map((event) => [eventIdentityKey(event), event])).values()
  );

  // Map RawEventUpsertRow fields to the memories table schema
  // Key difference: platform_id (raw_events) → source_id (memories)
  const memoryRows = dedupedEvents.map((event) => {
    // Auto-classify content_type for drift detection (§2.2)
    const contentType = classifyContentType({
      platform: event.platform,
      content: event.content,
      is_outbound: event.metadata?.is_outbound === true,
      event_type: event.event_type,
    });
    // Auto-compute date_bucket for state vector aggregation (§2.2)
    const dateBucket = event.timestamp
      ? new Date(event.timestamp).toISOString().split('T')[0]
      : new Date().toISOString().split('T')[0];

    return {
      user_id: event.user_id,
      platform: event.platform,
      source_id: event.platform_id,
      event_type: event.event_type,
      title: event.title,
      content: event.content,
      author: event.author,
      timestamp: event.timestamp,
      metadata: event.metadata,
      is_flagged: event.is_flagged,
      flag_severity: event.flag_severity,
      flag_reason: event.flag_reason,
      content_type: contentType,
      date_bucket: dateBucket,
    };
  });

  const { error: upsertError } = await supabase
    .from('memories')
    .upsert(memoryRows, { onConflict: 'user_id,platform,source_id' });

  if (!upsertError) {
    // Fire acute detection asynchronously (non-blocking)
    fireAcuteDetection(supabase, dedupedEvents).catch(() => {});
    // Fire entity extraction asynchronously (non-blocking)
    fireEntityExtraction(supabase, dedupedEvents).catch(() => {});
    return;
  }

  if (!hasMissingConflictConstraint(upsertError)) {
    throw upsertError;
  }

  console.warn(
    '[DB] memories upsert fallback activated because ON CONFLICT constraint is missing. Apply latest migrations.'
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
    if (uniqueIds.length === 0) continue;

    const { error: deleteError } = await supabase
      .from('memories')
      .delete()
      .eq('user_id', group.userId)
      .eq('platform', group.platform)
      .in('source_id', uniqueIds);

    if (deleteError) throw deleteError;
  }

  const { error: insertError } = await supabase.from('memories').insert(memoryRows);
  if (insertError) throw insertError;

  // Fire acute detection asynchronously (non-blocking)
  fireAcuteDetection(supabase, dedupedEvents).catch(() => {});
  // Fire entity extraction asynchronously (non-blocking)
  fireEntityExtraction(supabase, dedupedEvents).catch(() => {});
}

/**
 * Fire-and-forget acute detection on recently ingested events.
 * Runs in background — never blocks the sync response.
 */
async function fireAcuteDetection(supabase: SupabaseClient, events: RawEventUpsertRow[]) {
  try {
    const acuteEvents = events.map(e => ({
      id: `${e.user_id}-${e.platform}-${e.platform_id}`,
      user_id: e.user_id,
      platform: e.platform,
      title: e.title,
      content: e.content,
      author: e.author,
      timestamp: e.timestamp,
      is_outbound: e.metadata?.is_outbound === true,
    }));
    await processAcuteDetection(supabase, acuteEvents);
  } catch (err) {
    console.warn('[Acute] Background detection failed (non-fatal):', err);
  }
}

/**
 * Fire-and-forget entity extraction on recently ingested events.
 * Sends data to the new Python FastAPI Chronic Engine running locally.
 */
async function fireEntityExtraction(supabase: SupabaseClient, events: RawEventUpsertRow[]) {
  const CHRONIC_ENGINE_URL = process.env.CHRONIC_ENGINE_URL || 'http://127.0.0.1:8000';
  
  try {
    // Phase 3.A: Process ALL synced events regardless of platform
    const eligible = events.filter(e => e.content && e.content.length >= 80);
    if (eligible.length === 0) return;

    for (const event of eligible) {
      try {
        const response = await fetch(`${CHRONIC_ENGINE_URL}/extract`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            user_id: event.user_id,
            platform_id: event.platform_id,
            text: event.content.slice(0, 2000), // Send first 2000 chars to GLiNER
            threshold: 0.6
          })
        });

        if (!response.ok) {
          console.warn(`[Entities] Chronic Engine returned ${response.status}`);
          continue;
        }

        const data = await response.json();
        const entities = data.entities || [];
        const relations = data.relations || [];

        if (!entities.length && !relations.length) continue;

        // Store the raw output from GLiNER in the memories table (including start/end indices for Anchoring)
        await supabase
          .from('memories')
          .update({ 
            entities_extracted: entities,
            is_graph_extracted: true
          })
          .eq('user_id', event.user_id)
          .eq('platform', event.platform)
          .eq('source_id', event.platform_id);

        // Save relationships to the Bi-Temporal Graph table (Phase 2)
        if (relations.length > 0) {
          const edgesToInsert = relations.map((rel: any) => ({
             user_id: event.user_id,
             head_node_id: rel.head.toLowerCase().replace(/\s+/g, '_'),
             tail_node_id: rel.tail.toLowerCase().replace(/\s+/g, '_'),
             relation_label: rel.label,
             confidence: rel.score,
             observed_from: new Date().toISOString(),
             source_record_id: event.platform_id
          }));

          const { error: edgeError } = await supabase.from('chronic_edges').insert(edgesToInsert);
          if (edgeError) {
             console.warn('[Chronic Engine] Failed to save edges to Supabase:', edgeError.message);
          }
        }

        console.log(`[Chronic Engine] Successfully extracted ${entities.length} entities & ${relations.length} relations from ${event.platform}/${event.platform_id.slice(0, 12)} via FastAPI`);
      } catch (err) {
        console.warn('[Chronic Engine] Fetch failed (is the Python server running?):', err);
      }
    }
  } catch (err) {
    console.warn('[Chronic Engine] Background extraction failed:', err);
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
