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

    // Fetch memory source_ids and metadata for deep links
    const actionsData = actionsRes.data ?? [];
    const memoryIds = actionsData
      .map(a => a.memory_id)
      .filter((id): id is string => !!id && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id));

    interface MemoryMetadata {
      thread_id?: string;
      channel_id?: string;
      channel?: string;
      ts?: string;
      [key: string]: unknown;
    }

    const memoriesMap: Record<string, { source_id: string | null; metadata: MemoryMetadata }> = {};
    if (memoryIds.length > 0) {
      const { data: memories } = await supabase
        .from('memories')
        .select('id, source_id, metadata')
        .in('id', memoryIds);

      (memories ?? []).forEach(m => {
        memoriesMap[m.id] = {
          source_id: m.source_id || null,
          metadata: (m.metadata as MemoryMetadata) || {}
        };
      });
    }

    const actionsWithSource = actionsData.map(a => {
      const mem = a.memory_id ? memoriesMap[a.memory_id] : null;
      const sourceId = mem ? mem.source_id : null;
      const metadata = mem ? mem.metadata : null;
      
      // Calculate direct platform deep link
      let platformLink: string | null = null;
      const platform = a.platform.toLowerCase();
      
      if (platform === 'gmail') {
        const threadId = metadata?.thread_id || sourceId;
        if (threadId) {
          platformLink = `https://mail.google.com/mail/u/0/#all/${threadId}`;
        } else {
          platformLink = `https://mail.google.com/mail/u/0/#search/${encodeURIComponent(a.title)}`;
        }
      } else if (platform === 'slack') {
        const channelId = metadata?.channel_id || metadata?.channel;
        const ts = metadata?.ts;
        if (channelId) {
          if (ts) {
            platformLink = `https://slack.com/app_redirect?channel=${channelId}&message_ts=${ts}`;
          } else {
            platformLink = `https://slack.com/app_redirect?channel=${channelId}`;
          }
        } else if (sourceId && !sourceId.startsWith('test_')) {
          platformLink = `https://slack.com/app_redirect?channel=${sourceId}`;
        } else {
          platformLink = 'https://slack.com';
        }
      } else if (platform === 'github') {
        platformLink = sourceId ? `https://github.com/${sourceId}` : 'https://github.com';
      } else if (platform === 'linear') {
        platformLink = sourceId ? `https://linear.app/issue/${sourceId}` : 'https://linear.app';
      }

      return {
        ...a,
        source_id: sourceId,
        platform_link: platformLink
      };
    });

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
