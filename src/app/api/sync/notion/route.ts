import { NextResponse } from 'next/server';

import { upsertRawEventsSafely, upsertSyncStatusSafely } from '@/utils/supabase/upsert';
import { decryptToken } from '@/services/auth/tokens';
import { resolveSyncActor } from '@/utils/sync/actor';
import { scoreNotionEvent } from '@/utils/risk/scorer';

type NotionSearchResult = {
  id: string;
  object: 'page' | 'database' | string;
  url?: string;
  last_edited_time?: string;
  properties?: Record<string, { type?: string; title?: Array<{ plain_text: string }> }>;
  title?: Array<{ plain_text: string }>;
};

type NotionSearchResponse = {
  results?: NotionSearchResult[];
};

type NotionBlock = {
  id: string;
  type: string;
  has_children?: boolean;
  rich_text?: Array<{ plain_text?: string }>;
  paragraph?: { rich_text?: Array<{ plain_text?: string }> };
  heading_1?: { rich_text?: Array<{ plain_text?: string }> };
  heading_2?: { rich_text?: Array<{ plain_text?: string }> };
  heading_3?: { rich_text?: Array<{ plain_text?: string }> };
  bulleted_list_item?: { rich_text?: Array<{ plain_text?: string }> };
  numbered_list_item?: { rich_text?: Array<{ plain_text?: string }> };
  to_do?: { rich_text?: Array<{ plain_text?: string }> };
  quote?: { rich_text?: Array<{ plain_text?: string }> };
  callout?: { rich_text?: Array<{ plain_text?: string }> };
  code?: { rich_text?: Array<{ plain_text?: string }> };
};

function extractRichText(parts: Array<{ plain_text?: string }> | undefined) {
  return (parts || []).map((part) => part.plain_text || '').join(' ').trim();
}

function extractBlockText(block: NotionBlock) {
  const blockRecord = block as Record<string, unknown>;
  const typePayload = blockRecord[block.type] as { rich_text?: Array<{ plain_text?: string }> } | undefined;
  return extractRichText(typePayload?.rich_text || block.rich_text);
}

async function fetchNotionPageContent(accessToken: string, pageId: string) {
  const response = await fetch(`https://api.notion.com/v1/blocks/${pageId}/children?page_size=100`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Notion-Version': '2022-06-28',
      'Content-Type': 'application/json',
    },
    cache: 'no-store',
  });

  if (!response.ok) {
    return '';
  }

  const body = (await response.json()) as { results?: NotionBlock[] };
  return (body.results || []).map(extractBlockText).filter(Boolean).join('\n').slice(0, 10000);
}

function extractTitle(item: NotionSearchResult) {
  if (item.object === 'database' && item.title?.length) {
    return item.title.map((part) => part.plain_text).join(' ').trim() || 'Untitled database';
  }

  if (item.object === 'page' && item.properties) {
    const titleProperty = Object.values(item.properties).find((property) => property?.type === 'title');
    if (titleProperty?.title?.length) {
      return titleProperty.title.map((part) => part.plain_text).join(' ').trim() || 'Untitled page';
    }
  }

  return item.object === 'database' ? 'Untitled database' : 'Untitled page';
}

export async function POST(request: Request) {
  try {
    const actor = await resolveSyncActor(request);
    if ('status' in actor) {
      return NextResponse.json({ error: actor.error }, { status: actor.status });
    }

    const { supabase, userId } = actor;

    // 1. Get existing sync status to find the cursor
    const { data: currentStatus } = await supabase
      .from('sync_status')
      .select('cursor, total_items')
      .eq('user_id', userId)
      .eq('platform', 'notion')
      .maybeSingle();

    const { data: tokenRow } = await supabase
      .from('oauth_tokens')
      .select('access_token')
      .eq('user_id', userId)
      .eq('platform', 'notion')
      .maybeSingle();

    if (!tokenRow?.access_token) {
      return NextResponse.json({ error: 'Notion is not connected yet.' }, { status: 400 });
    }

    let accessToken: string;
    try {
      accessToken = decryptToken(tokenRow.access_token);
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      console.error('notion sync auth error:', detail);
      return NextResponse.json({ error: 'Unable to authenticate Notion connection.', detail }, { status: 401 });
    }

    const url = new URL(request.url);
    const depth = url.searchParams.get('depth') || 'shallow';
    const maxResultsPerPage = 100;
    const maxTotalResults = depth === 'deep' ? 500 : 50;

    // Mark as 'syncing'
    await upsertSyncStatusSafely(supabase, {
      user_id: userId,
      platform: 'notion',
      status: 'syncing',
      last_sync_at: new Date().toISOString(),
    });

    let allResults: NotionSearchResult[] = [];
    let nextCursor: string | undefined = currentStatus?.cursor || undefined;
    let hasMore = true;

    // --- PAGINATION LOOP ---
    while (allResults.length < maxTotalResults && hasMore) {
      const searchResponse = await fetch('https://api.notion.com/v1/search', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Notion-Version': '2022-06-28',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          page_size: Math.min(maxResultsPerPage, maxTotalResults - allResults.length),
          start_cursor: nextCursor,
          sort: {
            direction: 'descending',
            timestamp: 'last_edited_time'
          }
        }),
        cache: 'no-store',
      });

      if (!searchResponse.ok) {
        if (searchResponse.status === 401 || searchResponse.status === 403) {
          const detail = await searchResponse.text();
          throw new Error(`Notion auth failed: ${searchResponse.status} ${detail}`);
        }

        hasMore = false;
        break;
      }

      const body = (await searchResponse.json()) as { results?: NotionSearchResult[], next_cursor?: string | null };
      const pageResults = body.results ?? [];
      allResults = [...allResults, ...pageResults];
      
      nextCursor = body.next_cursor || undefined;
      if (!nextCursor) {
        hasMore = false;
        break;
      }
    }

    const events = await Promise.all(allResults.map(async (item) => {
      const title = extractTitle(item);
      const pageContent = item.object === 'page'
        ? await fetchNotionPageContent(accessToken, item.id)
        : '';
      const content = `${title}\n${pageContent}\n${item.url || ''}`.trim().slice(0, 12000);
      const risk = await scoreNotionEvent({ title, content });

      return {
        user_id: userId,
        platform: 'notion',
        platform_id: item.id,
        event_type: item.object,
        title,
        content,
        author: 'Notion',
        timestamp: item.last_edited_time ? new Date(item.last_edited_time).toISOString() : new Date().toISOString(),
        metadata: {
          object: item.object,
          url: item.url,
          page_content_indexed: pageContent.length > 0,
        },
        is_flagged: risk.flagged,
        flag_severity: risk.severity,
        flag_reason: risk.reasons.join(', '),
      };
    }));

    await upsertRawEventsSafely(supabase, events);

    // Update status and save cursor
    await Promise.all([
      upsertSyncStatusSafely(supabase, {
        user_id: userId,
        platform: 'notion',
        status: hasMore ? 'syncing' : 'connected',
        sync_progress: hasMore ? 50 : 100,
        total_items: (currentStatus?.total_items || 0) + events.length,
        last_sync_at: new Date().toISOString(),
        next_sync_at: new Date(Date.now() + 1000 * 60 * 30).toISOString(),
        cursor: hasMore ? nextCursor : null,
        error_message: null,
      }),
      supabase.from('user_profiles').update({
        // Use cumulative total — not just current batch
        memories_indexed: (currentStatus?.total_items || 0) + events.length,
        updated_at: new Date().toISOString(),
      }).eq('user_id', userId),
    ]);

    return NextResponse.json({
      ok: true,
      syncedItems: events.length,
      hasMore,
    });
  } catch (error) {
    console.error('notion sync error:', error);
    return NextResponse.json({ error: 'Unable to sync Notion data right now.' }, { status: 500 });
  }
}
