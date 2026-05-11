import { NextResponse } from 'next/server';
import { generateEmbedding } from '@/services/ai/ai';
import { buildDeterministicChunks } from '@/services/ai/chunking';
import { resolveSyncActor } from '@/utils/sync/actor';

/**
 * Background worker to generate embeddings for all 'raw_events' that haven't been indexed.
 * Optimized for high-throughput memory synthesis.
 */
export async function POST(request: Request) {
  try {
    const actor = await resolveSyncActor(request);
    if ('status' in actor) {
      return NextResponse.json({ error: actor.error }, { status: actor.status });
    }

    const { supabase, userId } = actor;

    // 1. Find events that don't have embeddings yet
    // Using the 'id' field of the joined 'embeddings' table to check for null
    const { data: events, error: fetchError } = await supabase
      .from('raw_events')
      .select('id, platform, event_type, title, content, embeddings(id)')
      .eq('user_id', userId)
      .not('content', 'is', null)
      .limit(200); // Voyage AI has 200M free tokens — batch 200 items safely


    if (fetchError) throw fetchError;

    // Filter manually for rows where embeddings array is empty
    const pendingEvents = (events || []).filter(e => !e.embeddings || (Array.isArray(e.embeddings) && e.embeddings.length === 0));

    if (pendingEvents.length === 0) {
      return NextResponse.json({ message: 'Neural index is current.', count: 0 });
    }

    console.log(`[AI-Brain] Found ${pendingEvents.length} new events. Indexing memories for user ${userId}...`);

    let successCount = 0;
    let indexedChunkCount = 0;
    let quotaExhausted = false;

    for (const event of pendingEvents) {
      if (quotaExhausted) break;

      try {
        const chunks = buildDeterministicChunks({
          platform: event.platform,
          eventType: event.event_type,
          title: event.title,
          content: event.content || '',
        });

        let insertedChunks = 0;

        for (const chunk of chunks) {
          if (quotaExhausted) break;

          const result = await generateEmbedding(chunk);
          if (!result) {
            // generateEmbedding returns null when BOTH providers 429'd
            console.warn(`[AI-Brain] Both providers quota-exhausted on event ${event.id}. Stopping batch.`);
            quotaExhausted = true;
            break;
          }

          const { error: insertError } = await supabase
            .from('embeddings')
            .insert({
              user_id: userId,
              event_id: event.id,
              content: chunk,
              embedding: result.embedding,
            });

          if (insertError) {
            console.warn('[AI-Brain] Persistence failed:', insertError.message);
            continue;
          }

          insertedChunks += 1;
          // Small delay to respect free-tier rate limits (300 req/min for Gemini)
          await new Promise(r => setTimeout(r, 250));
        }

        if (insertedChunks > 0) {
          successCount += 1;
          indexedChunkCount += insertedChunks;
        }
      } catch (err) {
        console.error(`[AI-Brain] Failed to index event ${event.id}:`, err);
      }
    }

    if (quotaExhausted) {
      console.warn('[AI-Brain] Batch stopped early — embedding quota exhausted. Will resume on next cron run.');
    }

    // Update user profile with new count
    const { count: totalIndexed } = await supabase
      .from('embeddings')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId);

    await supabase
      .from('user_profiles')
      .update({ memories_indexed: totalIndexed || 0, updated_at: new Date().toISOString() })
      .eq('user_id', userId);

    return NextResponse.json({ 
      message: `Neural indexing cycle complete.`, 
      indexed: successCount,
      indexedChunks: indexedChunkCount,
      totalAtUser: totalIndexed
    });
  } catch (err) {
    console.error('[AI-Brain] Deep indexing failure:', err);
    return NextResponse.json({ error: 'Internal neural link failure during indexing.' }, { status: 500 });
  }
}
