import { NextResponse } from 'next/server';

import { createClient } from '@/utils/supabase/server';
import { upsertMemoriesSafely, type MemoryUpsertRow } from '@/utils/supabase/memories';

export async function POST(request: Request) {
  try {
    const supabase = await createClient();

    // Authenticate the user session
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { platform, memories } = body as { platform: string; memories: Omit<MemoryUpsertRow, 'user_id'>[] };

    if (!platform || !Array.isArray(memories)) {
      return NextResponse.json({ error: 'Malformed payload' }, { status: 400 });
    }

    if (memories.length === 0) {
      return NextResponse.json({ inserted: 0, skipped: 0, errors: 0 });
    }

    // Limit single API payload batch size to prevent server-side function timeouts
    const MAX_BATCH_SIZE = 50;
    if (memories.length > MAX_BATCH_SIZE) {
      return NextResponse.json(
        { error: `Batch size exceeds limit of ${MAX_BATCH_SIZE} records. Please batch client-side.` },
        { status: 400 }
      );
    }

    // Map user_id to each incoming row
    const rowsToUpsert: MemoryUpsertRow[] = memories.map(m => ({
      ...m,
      user_id: user.id,
      platform,
    }));

    // Trigger vector embeddings generation and upsert
    const result = await upsertMemoriesSafely(supabase, rowsToUpsert);

    // Retrieve cumulative count of memories indexed for this manual platform
    const { count } = await supabase
      .from('memories')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('platform', platform);

    // Upsert sync status metadata
    await supabase.from('sync_status').upsert({
      user_id: user.id,
      platform,
      status: 'connected',
      sync_progress: 100,
      total_items: count || 0,
      last_sync_at: new Date().toISOString(),
      metadata: {
        last_imported_count: memories.length
      }
    }, { onConflict: 'user_id,platform' });

    return NextResponse.json(result);
  } catch (error) {
    console.error('[API Import] Error importing data:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
