import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { generateEmbedding } from '@/services/ai/ai';

/**
 * Neural Re-index: Regenerates embeddings for all memories that lack an embedding.
 * Reads from the unified `memories` table. Processes up to 200 items per call.
 */
export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // 1. Get raw events that don't have a matching 768d embedding yet
    // Or just all events if we want to be thorough
    const { data: events, error: fetchError } = await supabase
      .from('memories')
      .select('id, content')
      .eq('user_id', user.id)
      .is('embedding', null)
      .not('content', 'is', null)
      .limit(200);

    if (fetchError || !events) {
      throw new Error(`Failed to fetch memories for re-indexing: ${fetchError?.message}`);
    }

    console.log(`[Re-index] Processing ${events.length} memories for user ${user.id}`);

    let successCount = 0;
    const errors = [];

    for (const event of events) {
      try {
        const result = await generateEmbedding(event.content);
        if (result && result.embedding) {
          const { error: updateError } = await supabase
            .from('memories')
            .update({ embedding: result.embedding })
            .eq('id', event.id);

          if (updateError) throw updateError;
          successCount++;
        }
      } catch (err) {
        errors.push({ id: event.id, error: String(err) });
      }
    }

    return NextResponse.json({
      success: true,
      processed: events.length,
      successCount,
      errors: errors.length > 0 ? errors : null,
      message: `Neural re-indexing complete for ${successCount} records.`
    });

  } catch (err) {
    console.error('[Re-index API] Failure:', err);
    return NextResponse.json({ error: 'Failed to re-index neural memories.' }, { status: 500 });
  }
}
