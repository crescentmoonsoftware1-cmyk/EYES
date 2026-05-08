/**
 * Cron endpoint for processing embedding queue
 * Priority 3: Asyncronously processes embeddings that were queued during sync
 * 
 * Triggered by Vercel scheduler every 5 minutes
 * Processes up to BATCH_SIZE embeddings per run
 */

import { NextResponse } from 'next/server';
import { createAdminClient } from '@/utils/supabase/admin';

const BATCH_SIZE = Number(process.env.EMBEDDING_QUEUE_BATCH_SIZE || 50);
const MAX_RETRIES = Number(process.env.EMBEDDING_QUEUE_MAX_RETRIES || 3);
const OPENAI_TIMEOUT_MS = 30000;

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
  if (!expectedSecret) {
    return false;
  }

  const providedSecret = getCronSecret(request);
  return !!providedSecret && providedSecret === expectedSecret;
}

/**
 * Process embedding queue
 * Fetches pending embeddings, generates vectors, and updates database
 */
export async function POST(request: Request) {
  // Authorization check
  if (!isAuthorizedCron(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const startedAt = Date.now();
  const supabase = createAdminClient();

  try {
    // Fetch pending embeddings batch
    const { data: queue, error: fetchError } = await supabase
      .from('embedding_queue')
      .select(`
        id,
        user_id,
        raw_event_id,
        retry_count,
        raw_events!inner(id, user_id, summary, description)
      `)
      .eq('status', 'pending')
      .lt('retry_count', MAX_RETRIES)
      .order('created_at', { ascending: true })
      .limit(BATCH_SIZE);

    if (fetchError) {
      console.error('[Cron Embeddings] Fetch queue error:', fetchError);
      return NextResponse.json(
        { error: 'Failed to fetch embedding queue', detail: fetchError.message },
        { status: 500 }
      );
    }

    if (!queue || queue.length === 0) {
      return NextResponse.json({
        message: 'No embeddings to process',
        processed: 0,
        durationMs: Date.now() - startedAt,
      });
    }

    // Mark batch as processing
    const queueIds = queue.map((item) => item.id);
    await supabase
      .from('embedding_queue')
      .update({ status: 'processing', updated_at: new Date().toISOString() })
      .in('id', queueIds);

    // Process embeddings
    const openaiKey = process.env.OPENAI_API_KEY;
    if (!openaiKey) {
      console.error('[Cron Embeddings] OPENAI_API_KEY is not configured');
      
      // Mark as failed
      await supabase
        .from('embedding_queue')
        .update({ 
          status: 'failed',
          error_message: 'OPENAI_API_KEY not configured',
          updated_at: new Date().toISOString(),
        })
        .in('id', queueIds);

      return NextResponse.json(
        { error: 'OpenAI API key not configured' },
        { status: 500 }
      );
    }

    let successCount = 0;
    let failureCount = 0;

    for (const item of queue) {
      try {
        const raw_event = (item as any).raw_events;
        const content = `${raw_event.summary || ''} ${raw_event.description || ''}`.trim();

        if (!content) {
          // Skip empty content
          await supabase
            .from('embedding_queue')
            .update({ 
              status: 'completed',
              processed_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            })
            .eq('id', item.id);
          successCount++;
          continue;
        }

        // Call OpenAI embeddings API
        const embeddingResponse = await fetch('https://api.openai.com/v1/embeddings', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${openaiKey}`,
          },
          body: JSON.stringify({
            input: content,
            model: 'text-embedding-3-small',
            dimensions: 1536,
          }),
        });

        if (!embeddingResponse.ok) {
          const error = await embeddingResponse.text();
          throw new Error(`OpenAI API error (${embeddingResponse.status}): ${error}`);
        }

        const embeddingData = await embeddingResponse.json();
        const embedding = embeddingData.data?.[0]?.embedding;

        if (!embedding || !Array.isArray(embedding)) {
          throw new Error('Invalid embedding response from OpenAI');
        }

        // Insert into embeddings table
        const { error: insertError } = await supabase
          .from('embeddings')
          .insert({
            user_id: item.user_id,
            raw_event_id: item.raw_event_id,
            embedding,
            created_at: new Date().toISOString(),
          });

        if (insertError) {
          throw insertError;
        }

        // Mark queue item as completed
        await supabase
          .from('embedding_queue')
          .update({ 
            status: 'completed',
            processed_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq('id', item.id);

        successCount++;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`[Cron Embeddings] Failed to process queue item ${item.id}:`, message);

        // Mark as failed with retry logic
        await supabase
          .from('embedding_queue')
          .update({
            status: 'failed',
            retry_count: (item as any).retry_count + 1,
            error_message: message.slice(0, 500),
            updated_at: new Date().toISOString(),
          })
          .eq('id', item.id);

        failureCount++;
      }
    }

    console.log(
      `[Cron Embeddings] Processed ${successCount} successful, ${failureCount} failed out of ${queue.length}`
    );

    return NextResponse.json({
      message: 'Embedding queue processed',
      processed: successCount,
      failed: failureCount,
      total: queue.length,
      durationMs: Date.now() - startedAt,
    });
  } catch (err) {
    console.error('[Cron Embeddings] Fatal error:', err);
    return NextResponse.json(
      { error: 'Failed to process embedding queue', detail: String(err) },
      { status: 500 }
    );
  }
}

/**
 * Support manual triggers for testing
 */
export async function GET(request: Request) {
  return POST(request);
}
