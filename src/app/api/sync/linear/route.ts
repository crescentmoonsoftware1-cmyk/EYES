import { NextResponse } from 'next/server';
import { resolveSyncActor } from '@/utils/sync/actor';
import { upsertRawEventsSafely, upsertSyncStatusSafely } from '@/utils/supabase/upsert';
import { decryptToken } from '@/services/auth/tokens';

interface LinearIssueNode {
  id: string;
  title: string;
  description?: string;
  state?: {
    name: string;
  };
  updatedAt: string;
  dueDate?: string | null;
  team?: {
    name: string;
  };
}

interface LinearViewerResponse {
  data?: {
    viewer?: {
      assignedIssues?: {
        nodes?: LinearIssueNode[];
      };
    };
  };
}

export async function POST(request: Request) {
  const actor = await resolveSyncActor(request);
  if ('status' in actor) return NextResponse.json({ error: actor.error }, { status: actor.status });
  const { supabase, userId } = actor;

  try {
    const { data: tokenRow } = await supabase
      .from('oauth_tokens')
      .select('access_token')
      .eq('user_id', userId)
      .eq('platform', 'linear')
      .maybeSingle();

    if (!tokenRow?.access_token) {
      return NextResponse.json({ error: 'Linear is not connected.' }, { status: 401 });
    }

    const { data: currentStatus } = await supabase
      .from('sync_status')
      .select('total_items')
      .eq('user_id', userId)
      .eq('platform', 'linear')
      .maybeSingle();

    await upsertSyncStatusSafely(supabase, {
      user_id: userId,
      platform: 'linear',
      status: 'syncing',
      last_sync_at: new Date().toISOString(),
    });

    const accessToken = decryptToken(tokenRow.access_token);

    // Query assigned issues from Linear's GraphQL API
    const query = `
      query {
        viewer {
          assignedIssues {
            nodes {
              id
              title
              description
              state {
                name
              }
              updatedAt
              dueDate
              team {
                name
              }
            }
          }
        }
      }
    `;

    const response = await fetch('https://api.linear.app/graphql', {
      method: 'POST',
      headers: {
        Authorization: accessToken,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query }),
      cache: 'no-store',
    });

    if (!response.ok) {
      throw new Error(`Linear API error (${response.status}): ${await response.text()}`);
    }

    const body = (await response.json()) as LinearViewerResponse;
    const issues = body.data?.viewer?.assignedIssues?.nodes ?? [];

    const events = issues.map((issue) => {
      const isOverdue = issue.dueDate && new Date(issue.dueDate) < new Date() && issue.state?.name !== 'Done';
      return {
        user_id: userId,
        platform: 'linear',
        platform_id: `issue_${issue.id}`,
        event_type: 'issue',
        title: issue.title,
        content: issue.description ? `${issue.title}: ${issue.description}` : issue.title,
        author: 'Linear',
        timestamp: issue.updatedAt || new Date().toISOString(),
        is_flagged: Boolean(isOverdue),
        flag_severity: 'LOW',
        flag_reason: isOverdue ? 'Overdue Linear issue' : null,
        metadata: {
          id: issue.id,
          status: issue.state?.name,
          dueDate: issue.dueDate,
          team: issue.team?.name,
        },
      };
    });

    if (events.length > 0) {
      await upsertRawEventsSafely(supabase, events);
    }

    const { count: totalMemories } = await supabase
      .from('memories')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId);

    const now = new Date().toISOString();
    await Promise.all([
      upsertSyncStatusSafely(supabase, {
        user_id: userId,
        platform: 'linear',
        status: 'connected',
        sync_progress: 100,
        total_items: (currentStatus?.total_items || 0) + events.length,
        last_sync_at: now,
        next_sync_at: new Date(Date.now() + 3600000).toISOString(),
        error_message: null,
      }),
      supabase.from('user_profiles')
        .update({ memories_indexed: totalMemories ?? events.length, updated_at: now })
        .eq('user_id', userId),
    ]);

    return NextResponse.json({ success: true, count: events.length });
  } catch (err) {
    console.error('[Linear Sync] Error:', err);
    await upsertSyncStatusSafely(supabase, {
      user_id: userId,
      platform: 'linear',
      status: 'error',
      error_message: String(err).slice(0, 200),
    });
    return NextResponse.json({ error: 'Linear sync failed' }, { status: 500 });
  }
}