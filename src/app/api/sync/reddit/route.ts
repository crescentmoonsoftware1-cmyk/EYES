import { NextResponse } from 'next/server';

import { upsertRawEventsSafely, upsertSyncStatusSafely } from '@/utils/supabase/upsert';
import { getValidRedditToken } from '@/utils/oauth';
import { scoreRedditEvent } from '@/utils/risk/scorer';
import { resolveSyncActor } from '@/utils/sync/actor';

type RedditMe = { name: string };

type RedditCommentListing = {
  data?: {
    children?: Array<{
      data: {
        id: string;
        name: string;
        body?: string;
        subreddit?: string;
        permalink?: string;
        score?: number;
        created_utc?: number;
      };
    }>;
  };
};

export async function POST(request: Request) {
  try {
    const actor = await resolveSyncActor(request);
    if ('status' in actor) {
      return NextResponse.json({ error: actor.error }, { status: actor.status });
    }

    const { supabase, userId } = actor;

    const { data: currentStatus } = await supabase
      .from('sync_status')
      .select('cursor, total_items')
      .eq('user_id', userId)
      .eq('platform', 'reddit')
      .maybeSingle();

    await upsertSyncStatusSafely(supabase, {
      user_id: userId,
      platform: 'reddit',
      status: 'syncing',
      last_sync_at: new Date().toISOString(),
    });

    const accessToken = await getValidRedditToken(supabase, userId);
    if (!accessToken) {
      return NextResponse.json({ error: 'Reddit session expired and refresh failed.' }, { status: 401 });
    }

    const meResponse = await fetch('https://oauth.reddit.com/api/v1/me', {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'User-Agent': 'the-eyes/1.0',
      },
      cache: 'no-store',
    });

    if (!meResponse.ok) {
      return NextResponse.json({ error: `Reddit profile request failed (${meResponse.status})` }, { status: 502 });
    }

    const me = (await meResponse.json()) as RedditMe;

    const url = new URL(request.url);
    const depth = url.searchParams.get('depth') || 'shallow';
    const maxTotalRequests = depth === 'deep' ? 1000 : 25;
    
    let allChildren: any[] = [];
    let afterToken: string | undefined = currentStatus?.cursor || undefined;
    let hasMore = true;

    // --- PAGINATION LOOP ---
    while (allChildren.length < maxTotalRequests && hasMore) {
      const fetchUrl = new URL(`https://oauth.reddit.com/user/${me.name}/comments`);
      fetchUrl.searchParams.set('limit', '50');
      if (afterToken) fetchUrl.searchParams.set('after', afterToken);

      const commentsResponse = await fetch(fetchUrl.toString(), {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'User-Agent': 'the-eyes/1.0',
        },
        cache: 'no-store',
      });

      if (!commentsResponse.ok) {
        hasMore = false;
        break;
      }

      const body = (await commentsResponse.json()) as { data?: { children?: any[], after?: string | null } };
      const children = body.data?.children ?? [];
      allChildren = [...allChildren, ...children];
      
      afterToken = body.data?.after || undefined;
      if (!afterToken) {
        hasMore = false;
        break;
      }
      
      // Respect Reddit API rate limit (1 req/sec)
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    const events = await Promise.all(allChildren.map(async (entry) => {
      const data = entry.data;
      const content = data.body || '';
      const risk = await scoreRedditEvent({
        body: content,
        subreddit: data.subreddit || '',
        score: data.score,
      });

      return {
        user_id: userId,
        platform: 'reddit',
        platform_id: data.name || data.id,
        event_type: 'comment',
        title: `r/${data.subreddit || 'unknown'} comment`,
        content,
        author: me.name,
        timestamp: data.created_utc ? new Date(data.created_utc * 1000).toISOString() : new Date().toISOString(),
        metadata: {
          subreddit: data.subreddit,
          permalink: data.permalink,
          score: data.score,
          risk_score: risk.score,
          risk_factors: risk.reasons,
        },
        is_flagged: risk.flagged,
        flag_severity: risk.severity,
        flag_reason: risk.reasons[0] || null,
      };
    }));

    await upsertRawEventsSafely(supabase, events);

    const { count: totalMemories } = await supabase
      .from('memories')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId);

    const [, profileUpdate] = await Promise.all([
      upsertSyncStatusSafely(supabase, {
        user_id: userId,
        platform: 'reddit',
        status: hasMore ? 'syncing' : 'connected',
        sync_progress: hasMore ? 50 : 100,
        total_items: (currentStatus?.total_items || 0) + events.length,
        last_sync_at: new Date().toISOString(),
        next_sync_at: new Date(Date.now() + 1000 * 60 * 60).toISOString(),
        cursor: hasMore ? afterToken : null,
        error_message: null,
      }),
      supabase.from('user_profiles').update({
        memories_indexed: totalMemories ?? events.length,
        updated_at: new Date().toISOString(),
      }).eq('user_id', userId),
    ]);

    if (profileUpdate.error) {
      throw profileUpdate.error;
    }

    return NextResponse.json({ 
      ok: true, 
      syncedComments: events.length,
      hasMore 
    });
  } catch (error) {
    console.error('reddit sync error:', error);
    return NextResponse.json({ error: 'Unable to sync Reddit data right now.' }, { status: 500 });
  }
}
