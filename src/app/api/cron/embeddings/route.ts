/**
 * Cron endpoint: background embedding worker for ALL users.
 *
 * Triggered by Vercel scheduler every 5 minutes (see vercel.json).
 * Scans the `memories` table for rows with embedding IS NULL,
 * generates 1024-dim vectors via Gemini gemini-embedding-001,
 * and writes them back inline to memories.embedding.
 *
 * Replaces the broken OpenAI/raw_events implementation.
 */

import { NextResponse } from 'next/server';
import { createAdminClient } from '@/utils/supabase/admin';
import { generateEmbedding } from '@/services/ai/ai';

export const maxDuration = 60; // Max allowed for Vercel Hobby plan

/** Max memories to embed per cron tick (across all users). Keep ≤100 on free tier. */
const BATCH_SIZE = Number(process.env.EMBEDDING_QUEUE_BATCH_SIZE || 50);

/** Milliseconds between individual embedding API calls — avoids rate-limit bursts. */
const INTER_CALL_DELAY_MS = Number(process.env.EMBEDDING_INTER_CALL_DELAY_MS || 250);

/** How many consecutive provider failures before we abort the whole batch early. */
const MAX_CONSECUTIVE_FAILURES = 3;

function getCronSecret(request: Request): string | null {
  const authHeader = request.headers.get('authorization');
  if (authHeader?.startsWith('Bearer ')) {
    return authHeader.slice('Bearer '.length).trim();
  }
  const xSecret = request.headers.get('x-cron-secret');
  if (xSecret) return xSecret.trim();
  return null;
}

function isAuthorizedCron(request: Request): boolean {
  const expectedSecret = process.env.CRON_SECRET;
  if (!expectedSecret) return false;
  const providedSecret = getCronSecret(request);
  return !!providedSecret && providedSecret === expectedSecret;
}

/**
 * POST /api/cron/embeddings
 * Processes a batch of un-embedded memories across all users.
 */
export async function POST(request: Request) {
  if (!isAuthorizedCron(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const startedAt = Date.now();
  const supabase = createAdminClient();

  try {
    // ── 1. Fetch a batch of memories missing embeddings (across ALL users) ────
    const { data: memories, error: fetchError } = await supabase
      .from('memories')
      .select('id, user_id, platform, title, content')
      .is('embedding', null)
      .not('content', 'is', null)
      .order('synced_at', { ascending: true }) // oldest-first: drain backlog in order
      .limit(BATCH_SIZE);

    if (fetchError) {
      console.error('[Cron Embeddings] Failed to fetch memories:', fetchError.message);
      return NextResponse.json(
        { error: 'Failed to fetch embedding backlog', detail: fetchError.message },
        { status: 500 }
      );
    }

    if (!memories || memories.length === 0) {
      return NextResponse.json({
        message: 'No memories pending embedding — neural index is current.',
        processed: 0,
        durationMs: Date.now() - startedAt,
      });
    }

    console.log(`[Cron Embeddings] Processing ${memories.length} un-embedded memories...`);

    let successCount = 0;
    let failureCount = 0;
    let consecutiveFailures = 0;

    for (const memory of memories) {
      // Vercel Hobby CPU Guard: Stop if approaching 60s timeout
      if (Date.now() - startedAt > 45000) {
        console.warn('[Cron Embeddings] Vercel 60s CPU limit approaching — pausing batch safely to avoid timeout.');
        break;
      }

      // Abort early if providers are consistently failing
      if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
        console.warn(
          `[Cron Embeddings] ${MAX_CONSECUTIVE_FAILURES} consecutive provider failures — ` +
          `aborting batch. Will resume on next cron tick.`
        );
        break;
      }

      try {
        // Build the text to embed
        const textToEmbed = [memory.title, memory.content]
          .filter(Boolean)
          .join('\n')
          .slice(0, 8000);

        if (!textToEmbed.trim()) {
          // Nothing to embed — mark it so it won't block future batches
          // by setting a zero-vector placeholder ... but better: just skip
          // and log. The row will be revisited if content is added later.
          console.warn(`[Cron Embeddings] Memory ${memory.id} has empty content — skipping.`);
          continue;
        }

        // generateEmbedding uses: Gemini gemini-embedding-001 (sole provider, 1024d)
        const result = await generateEmbedding(textToEmbed);

        // Narrow: generateEmbedding returns EmbedResult | string | null
        if (!result || typeof result === 'string' || !('embedding' in result) || !Array.isArray(result.embedding)) {
          console.warn(
            `[Cron Embeddings] All embedding providers exhausted for memory ${memory.id} ` +
            `(user ${memory.user_id}, platform ${memory.platform}).`
          );
          consecutiveFailures += 1;
          failureCount += 1;
          continue;
        }

        // ── 2. Write the embedding back to the memories row ─────────────────
        const { error: updateError } = await supabase
          .from('memories')
          .update({ embedding: result.embedding, updated_at: new Date().toISOString() })
          .eq('id', memory.id)
          .eq('user_id', memory.user_id); // belt-and-suspenders: match user_id too

        if (updateError) {
          console.warn(
            `[Cron Embeddings] DB update failed for memory ${memory.id}:`,
            updateError.message
          );
          failureCount += 1;
          consecutiveFailures += 1;
          continue;
        }

        successCount += 1;
        consecutiveFailures = 0; // reset on any success

        // Rate-limit safety: pause between API calls
        await new Promise((r) => setTimeout(r, INTER_CALL_DELAY_MS));

      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(`[Cron Embeddings] Unexpected error on memory ${memory.id}:`, message);
        failureCount += 1;
        consecutiveFailures += 1;
      }
    }

    const durationMs = Date.now() - startedAt;
    const remaining = memories.length - successCount - failureCount;

    console.log(
      `[Cron Embeddings] Done — success=${successCount} failed=${failureCount} ` +
      `skipped=${remaining} duration=${durationMs}ms`
    );

    return NextResponse.json({
      message: 'Embedding batch complete.',
      processed: successCount,
      failed: failureCount,
      total: memories.length,
      abortedEarly: consecutiveFailures >= MAX_CONSECUTIVE_FAILURES,
      durationMs,
    });

  } catch (err) {
    console.error('[Cron Embeddings] Fatal error:', err);
    return NextResponse.json(
      { error: 'Embedding cron failed', detail: String(err) },
      { status: 500 }
    );
  }
}

/** Support manual triggers for testing without a scheduler. */
export async function GET(request: Request) {
  return POST(request);
}
