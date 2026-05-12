
import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

/**
 * Monitoring API: Returns a global view of the user's sync progress.
 * Used for the "Live Indexing Counter" in the dashboard.
 */
export async function GET(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // 1. Get current sync status for all platforms
    const { data: statusRows } = await supabase
      .from('sync_status')
      .select('platform, status, sync_progress, total_items, last_sync_at, error_message')
      .eq('user_id', user.id);

    // 2. Get real-time total memory count directly from memories table
    const { count: memoriesCount } = await supabase
      .from('memories')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id);

    const isAnySyncing = statusRows?.some(s => s.status === 'syncing') || false;
    const activeSyncs = statusRows?.filter(s => s.status === 'syncing').map(s => s.platform) || [];

    return NextResponse.json({
      userId: user.id,
      memoriesIndexed: memoriesCount ?? 0,
      isSyncing: isAnySyncing,
      activeSyncs,
      platforms: statusRows || [],
      observabilityReady: true,
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    console.error('[Monitoring] Status API failure:', err);
    return NextResponse.json({ 
      error: 'Unable to read sync status.',
      observabilityReady: false 
    }, { status: 500 });
  }
}
