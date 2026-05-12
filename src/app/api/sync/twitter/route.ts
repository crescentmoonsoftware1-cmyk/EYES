import { NextResponse } from 'next/server';
import { resolveSyncActor } from '@/utils/sync/actor';
import { upsertSyncStatusSafely, upsertRawEventsSafely } from '@/utils/supabase/upsert';
import { decryptToken } from '@/utils/tokens';
import { scoreTwitterEvent } from '@/utils/risk/scorer';

type TweetV2 = {
  id: string;
  text: string;
  created_at?: string;
  public_metrics?: {
    retweet_count?: number;
    reply_count?: number;
    like_count?: number;
    quote_count?: number;
  };
};

export async function POST(request: Request) {
  const actor = await resolveSyncActor(request);
  if ('status' in actor) {
    return NextResponse.json({ error: actor.error }, { status: actor.status });
  }

  const { supabase, userId } = actor;

  try {
    const { data: tokenRow } = await supabase
      .from('oauth_tokens')
      .select('access_token')
      .eq('user_id', userId)
      .eq('platform', 'twitter')
      .maybeSingle();

    if (!tokenRow?.access_token) {
      return NextResponse.json({ error: 'Twitter is not connected' }, { status: 401 });
    }

    const accessToken = decryptToken(tokenRow.access_token);

    // Mark as syncing
    await upsertSyncStatusSafely(supabase, {
      user_id: userId,
      platform: 'twitter',
      status: 'syncing',
      last_sync_at: new Date().toISOString(),
    });

    // Fetch Tweets from Twitter API v2
    const response = await fetch('https://api.twitter.com/2/users/me/tweets?max_results=10&tweet.fields=created_at,public_metrics', {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
      },
    });

    const body = await response.json();
    if (!response.ok) throw new Error(body.detail || 'Twitter API Error');

    const tweets = body.data || [];
    
    const events = await Promise.all(tweets.map(async (tweet: TweetV2) => {
      const metrics = tweet.public_metrics || {};
      const reach = (metrics.retweet_count || 0) + (metrics.reply_count || 0) + (metrics.like_count || 0);
      const risk = await scoreTwitterEvent({
        text: tweet.text,
        reach: reach,
      });

      return {
        user_id: userId,
        platform: 'twitter',
        platform_id: tweet.id,
        event_type: 'tweet',
        title: 'X/Twitter Post',
        content: tweet.text,
        author: 'Me',
        timestamp: tweet.created_at,
        is_flagged: risk.flagged,
        flag_severity: risk.severity,
        flag_reason: risk.reasons.join(', '),
        metadata: {
          tweet_id: tweet.id,
          public_metrics: metrics,
          reach,
        }
      };
    }));

    if (events.length > 0) {
      await upsertRawEventsSafely(supabase, events);
    }

    const { count: totalMemories } = await supabase
      .from('memories')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId);

    const now = new Date().toISOString();
    await upsertSyncStatusSafely(supabase, {
      user_id: userId,
      platform: 'twitter',
      status: 'connected',
      sync_progress: 100,
      total_items: events.length,
      last_sync_at: now,
      next_sync_at: new Date(Date.now() + 3600000).toISOString(),
    });
    await supabase.from('user_profiles')
      .update({ memories_indexed: totalMemories ?? events.length, updated_at: now })
      .eq('user_id', userId);

    return NextResponse.json({ success: true, count: events.length });
  } catch (err) {
    console.error('[Twitter Sync] Error:', err);
    await upsertSyncStatusSafely(supabase, { user_id: userId, platform: 'twitter', status: 'error', error_message: String(err).slice(0, 200) });
    return NextResponse.json({ error: 'Twitter sync failed' }, { status: 500 });
  }
}
