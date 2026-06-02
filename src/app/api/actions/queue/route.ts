import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

/**
 * GET /api/actions/queue
 * Returns pending actions from DB instantly — no AI call.
 * The UI loads this on mount for zero-latency display.
 */
export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    // Run queries
    const [actionsRes, logRes, recentRes, platformRes] = await Promise.all([
      supabase
        .from('action_queue')
        .select('*')
        .eq('user_id', user.id)
        .eq('status', 'pending')
        .order('confidence', { ascending: false })
        .order('extracted_at', { ascending: false })
        .limit(50),

      supabase
        .from('action_extraction_log')
        .select('last_run_at, memory_count')
        .eq('user_id', user.id)
        .maybeSingle(),

      // Last 5 approved or dismissed actions for the "Recently Handled" log
      supabase
        .from('action_queue')
        .select('id, platform, title, status, executed_at, extracted_at')
        .eq('user_id', user.id)
        .in('status', ['approved', 'dismissed', 'executed'])
        .order('executed_at', { ascending: false })
        .limit(5),

      // Platform memory counts for the scan stats
      supabase
        .from('memories')
        .select('platform')
        .eq('user_id', user.id)
        .in('platform', ['gmail', 'google-calendar', 'github', 'linear', 'trello', 'slack', 'notion', 'discord'])
        .limit(5000),
    ]);

    if (actionsRes.error) throw actionsRes.error;

    // Fetch memory source_ids for deep links
    const actionsData = actionsRes.data ?? [];
    const memoryIds = actionsData
      .map(a => a.memory_id)
      .filter((id): id is string => !!id && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id));

    let memorySourceMap: Record<string, string> = {};
    if (memoryIds.length > 0) {
      const { data: memories } = await supabase
        .from('memories')
        .select('id, source_id')
        .in('id', memoryIds);

      (memories ?? []).forEach(m => {
        if (m.source_id) {
          memorySourceMap[m.id] = m.source_id;
        }
      });
    }

    const actionsWithSource = actionsData.map(a => ({
      ...a,
      source_id: a.memory_id ? memorySourceMap[a.memory_id] || null : null
    }));

    const lastRunAt = logRes.data?.last_run_at ? new Date(logRes.data.last_run_at) : null;
    const isStale = !lastRunAt || (Date.now() - lastRunAt.getTime()) > 30 * 60 * 1000;

    // Build platform counts map
    const platformCounts: Record<string, number> = {};
    (platformRes.data ?? []).forEach(r => {
      platformCounts[r.platform] = (platformCounts[r.platform] ?? 0) + 1;
    });

    return NextResponse.json({
      actions: actionsWithSource,
      meta: {
        count: actionsWithSource.length,
        isStale,
        lastRunAt: lastRunAt?.toISOString() ?? null,
        scanStats: platformCounts,
        totalMemoryCount: logRes.data?.memory_count ?? 0,
      },
      recentlyHandled: recentRes.data ?? [],
    });
  } catch (err) {
    console.error('[ActionQueue GET] Error:', err);
    return NextResponse.json({ error: 'Failed to load action queue' }, { status: 500 });
  }
}

/**
 * PATCH /api/actions/queue
 * Updates action status (dismiss / approve / executed / failed)
 */
export async function PATCH(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id, status, ...updates } = await request.json() as {
      id: string;
      status: 'pending' | 'approved' | 'dismissed' | 'executed' | 'failed';
      [key: string]: unknown;
    };

    if (!id || !status) return NextResponse.json({ error: 'id and status required' }, { status: 400 });

    const patch: Record<string, unknown> = { status, ...updates };
    if (status === 'executed' || status === 'approved') patch.executed_at = new Date().toISOString();

    const { error } = await supabase
      .from('action_queue')
      .update(patch)
      .eq('id', id)
      .eq('user_id', user.id);

    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[ActionQueue PATCH] Error:', err);
    return NextResponse.json({ error: 'Failed to update action' }, { status: 500 });
  }
}
