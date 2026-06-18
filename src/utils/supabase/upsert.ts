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
 * Extracts people, orgs, tools from each memory and populates entities table.
 * Limits to 5 events per batch to control AI costs.
 */
async function fireEntityExtraction(supabase: SupabaseClient, events: RawEventUpsertRow[]) {
  try {
    // Only extract from events with meaningful content
    const eligible = events.filter(e => e.content && e.content.length >= 80).slice(0, 5);
    if (eligible.length === 0) return;

    const { invokeModel } = await import('@/services/ai/ai');

    for (const event of eligible) {
      try {
        const aiResponse = await invokeModel({
          capability: 'classify',
          system: 'You extract named entities from text. Respond with valid JSON only.',
          messages: [{
            role: 'user',
            content: `Extract entities from this message. Return JSON array only:
[{"type":"person|organization|tool|place","name":"Exact Name"}]
Return [] if no entities found.

Text: ${event.content.slice(0, 1000)}`,
          }],
          preference: 'auto',
          capture: false,
        });

        if (!aiResponse) continue;

        let entities: Array<{ type: string; name: string }> = [];
        try {
          const match = String(aiResponse).match(/\[[\s\S]*?\]/);
          if (match) entities = JSON.parse(match[0]);
        } catch { continue; }

        if (!entities.length) continue;

        const enriched = entities.map(e => ({
          ...e,
          canonical_id: `${e.type}_${e.name.toLowerCase().replace(/\s+/g, '_').slice(0, 40)}`,
        }));

        // Store in entities_extracted column
        await supabase
          .from('memories')
          .update({ entities_extracted: enriched })
          .eq('user_id', event.user_id)
          .eq('platform', event.platform)
          .eq('source_id', event.platform_id)
          .then(() => {});

        // Upsert into entities table
        for (const entity of enriched) {
          await supabase
            .from('entities')
            .upsert({
              user_id: event.user_id,
              canonical_id: entity.canonical_id,
              name: entity.name,
              entity_type: entity.type,
              last_seen_at: new Date().toISOString(),
            }, { onConflict: 'user_id,canonical_id' })
            .then(() => {});
        }

        console.log(`[Entities] Extracted ${enriched.length} entities from ${event.platform}/${event.platform_id.slice(0, 12)}`);
      } catch {
        // Non-critical — skip this event
      }
    }
  } catch (err) {
    console.warn('[Entities] Background extraction failed (non-fatal):', err);
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
