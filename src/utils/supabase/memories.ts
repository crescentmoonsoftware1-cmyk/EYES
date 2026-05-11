import type { SupabaseClient } from '@supabase/supabase-js';
import { buildDeterministicChunks } from '@/services/ai/chunking';
import { generateEmbedding } from '@/services/ai/ai';

// ─── Types ────────────────────────────────────────────────────────────────────

export type MemoryUpsertRow = {
  user_id: string;
  platform: string;
  source_id: string;         // original ID from the platform
  event_type?: string | null;
  title?: string | null;
  content: string;
  author?: string | null;
  source_url?: string | null;
  timestamp?: string | null;
  metadata?: Record<string, unknown>;
  is_flagged?: boolean;
  flag_severity?: string | null;
  flag_reason?: string | null;
};

export type MemoryUpsertResult = {
  inserted: number;
  skipped: number;
  errors: number;
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

// ─── Memory Upsert (with inline embedding) ───────────────────────────────────

/**
 * Upserts a batch of memory rows into the unified 'memories' table.
 * Generates Gemini embeddings inline for each row.
 * Uses ON CONFLICT (user_id, platform, source_id) to prevent duplicates.
 */
export async function upsertMemoriesSafely(
  supabase: SupabaseClient,
  rows: MemoryUpsertRow[]
): Promise<MemoryUpsertResult> {
  if (rows.length === 0) return { inserted: 0, skipped: 0, errors: 0 };

  // Deduplicate within the batch itself
  const seen = new Set<string>();
  const deduped = rows.filter((row) => {
    const key = `${row.user_id}::${row.platform}::${row.source_id}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  let inserted = 0;
  let skipped = 0;
  let errors = 0;

  // Process in batches of 10 to avoid overwhelming the embedding API
  const BATCH_SIZE = 10;
  for (let i = 0; i < deduped.length; i += BATCH_SIZE) {
    const batch = deduped.slice(i, i + BATCH_SIZE);

    await Promise.all(
      batch.map(async (row) => {
        try {
          // Build the text to embed: header + content (same as chunking logic)
          const textToEmbed = buildEmbedText(row);

          // Generate embedding via Gemini embedding-001 (768 dims)
          const embeddingResult = await generateEmbedding(textToEmbed);
          const embedding = embeddingResult?.embedding ?? null;

          // IMPORTANT: only include 'embedding' in the upsert if we have a real value.
          // If we set embedding: null on an existing row, it overwrites the stored embedding.
          const baseFields = {
            user_id: row.user_id,
            platform: row.platform,
            source_id: row.source_id,
            event_type: row.event_type ?? null,
            title: row.title ?? null,
            content: row.content,
            author: row.author ?? null,
            source_url: row.source_url ?? null,
            timestamp: row.timestamp ?? null,
            metadata: row.metadata ?? {},
            is_flagged: row.is_flagged ?? false,
            flag_severity: row.flag_severity ?? null,
            flag_reason: row.flag_reason ?? null,
            updated_at: new Date().toISOString(),
          };

          const upsertPayload = embedding
            ? { ...baseFields, embedding }   // include embedding only when we have it
            : baseFields;                    // leave existing embedding untouched on conflict

          const { error } = await supabase.from('memories').upsert(
            upsertPayload,
            { onConflict: 'user_id,platform,source_id' }
          );

          if (error) {
            console.error(`[Memories] Upsert failed for ${row.platform}/${row.source_id}:`, error.message);
            errors++;
          } else {
            inserted++;
          }
        } catch (err) {
          console.error(`[Memories] Error processing ${row.platform}/${row.source_id}:`, err);
          errors++;
        }
      })
    );

    // Small delay between batches to respect embedding API rate limits
    if (i + BATCH_SIZE < deduped.length) {
      await sleep(150);
    }
  }

  return { inserted, skipped, errors };
}

/**
 * Builds the text string that gets embedded for a memory row.
 * Injects platform/type context so the vector carries identity info.
 */
function buildEmbedText(row: MemoryUpsertRow): string {
  const header = [
    `[Source: ${row.platform}]`,
    row.event_type ? `[Type: ${row.event_type}]` : null,
    row.title ? `Title: ${row.title}` : null,
  ]
    .filter(Boolean)
    .join(' ');

  const body = row.content.trim().slice(0, 8000); // Gemini embedding input cap
  return `${header}\n\n${body}`;
}

// ─── Sync Status Upsert ───────────────────────────────────────────────────────

export async function upsertSyncStatusSafely(
  supabase: SupabaseClient,
  syncStatus: SyncStatusUpsertRow
) {
  const { error } = await supabase
    .from('sync_status')
    .upsert(syncStatus, { onConflict: 'user_id,platform' });

  if (!error) return;

  // Fallback: plain update if upsert fails (missing constraint)
  const { error: updateError } = await supabase
    .from('sync_status')
    .update(syncStatus)
    .eq('user_id', syncStatus.user_id)
    .eq('platform', syncStatus.platform);

  if (updateError) throw updateError;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Re-export old type for backward compatibility with any remaining usages
export type { MemoryUpsertRow as RawEventUpsertRow };
