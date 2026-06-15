import { NextResponse } from 'next/server';
import { generateEmbedding } from '@/services/ai/ai';
import { resolveSyncActor } from '@/utils/sync/actor';

/**
 * Background worker — generates embeddings for memories that have NULL embedding.
 * Targets the unified `memories` table.
 * Uses Gemini gemini-embedding-001 (1024 dims). Processes 200 items per call.
 */
export async function POST(request: Request) {
  try {
    const actor = await resolveSyncActor(request);
    if ('status' in actor) {
      return NextResponse.json({ error: actor.error }, { status: actor.status });
    }

    const { supabase, userId } = actor;

    // 1. Fetch memories that haven't been embedded yet
    const { data: memories, error: fetchError } = await supabase
      .from('memories')
      .select('id, platform, event_type, title, content')
      .eq('user_id', userId)
      .is('embedding', null)
      .not('content', 'is', null)
      .limit(200); // Voyage AI: 200M free tokens — safe to batch 200 items

    if (fetchError) throw fetchError;

    if (!memories || memories.length === 0) {
      // Count total embedded for the response
      const { count: totalIndexed } = await supabase
        .from('memories')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId)
        .not('embedding', 'is', null);

      return NextResponse.json({
        message: 'Index is current — all memories embedded.',
        indexed: 0,
        totalAtUser: totalIndexed ?? 0,
      });
    }

    console.log(`[AI-Brain] Found ${memories.length} un-embedded memories for user ${userId}. Starting indexing...`);

    let successCount = 0;
    let quotaExhausted = false;

    for (const memory of memories) {
      if (quotaExhausted) break;

      try {
        // Build the text to embed from the memory fields
        const textToEmbed = [
          memory.title,
          memory.content,
        ].filter(Boolean).join('\n').slice(0, 8000);

        if (!textToEmbed.trim()) continue;

        const result = await generateEmbedding(textToEmbed);

        if (!result) {
          console.warn(`[AI-Brain] Both embedding providers exhausted on memory ${memory.id}. Stopping batch.`);
          quotaExhausted = true;
          break;
        }

        // Narrow: generateEmbedding returns EmbedResult | string | null.
        // A string result means the model returned text instead of a vector — treat as failure.
        if (typeof result === 'string' || !('embedding' in result)) {
          console.warn(`[AI-Brain] Unexpected non-vector result for memory ${memory.id}. Skipping.`);
          continue;
        }

        // Update the embedding column directly on the memories row
        const { error: updateError } = await supabase
          .from('memories')
          .update({ embedding: result.embedding })
          .eq('id', memory.id)
          .eq('user_id', userId);

        if (updateError) {
          console.warn(`[AI-Brain] Failed to save embedding for memory ${memory.id}:`, updateError.message);
          continue;
        }

        successCount += 1;
        // 250ms delay — keeps us well within Voyage's rate limits
        await new Promise(r => setTimeout(r, 250));

      } catch (err) {
        console.error(`[AI-Brain] Error embedding memory ${memory.id}:`, err);
      }
    }

    if (quotaExhausted) {
      console.warn('[AI-Brain] Batch stopped early — quota exhausted. Will resume on next run.');
    }

    // Count total embedded now
    const { count: totalIndexed } = await supabase
      .from('memories')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .not('embedding', 'is', null);

    // Update user profile counter
    await supabase
      .from('user_profiles')
      .update({ memories_indexed: totalIndexed ?? 0, updated_at: new Date().toISOString() })
      .eq('user_id', userId);

    console.log(`[AI-Brain] Batch done — embedded ${successCount} memories. Total indexed: ${totalIndexed}`);

    return NextResponse.json({
      message: 'Indexing cycle complete.',
      indexed: successCount,
      totalAtUser: totalIndexed ?? 0,
      quotaExhausted,
    });

  } catch (err) {
    console.error('[AI-Brain] Deep indexing failure:', err);
    return NextResponse.json({ error: 'Internal failure during indexing.' }, { status: 500 });
  }
}
