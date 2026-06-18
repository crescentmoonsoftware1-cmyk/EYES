import { NextResponse } from 'next/server';

import { getValidGoogleToken } from '@/services/auth/oauth';
import { upsertRawEventsSafely, upsertSyncStatusSafely } from '@/utils/supabase/upsert';
import { resolveSyncActor } from '@/utils/sync/actor';

export async function POST(request: Request) {
  if (process.env.MOCK_MODE === 'true') {
    return NextResponse.json({
      ok: true,
      syncedDocuments: 3,
      hasMore: false,
    });
  }

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
      .eq('platform', 'google_docs')
      .maybeSingle();

    const accessToken = await getValidGoogleToken(supabase, userId, 'google_docs');
    if (!accessToken) {
      return NextResponse.json({ error: 'Google Docs session expired and refresh failed.' }, { status: 401 });
    }

    // Mark as syncing
    await upsertSyncStatusSafely(supabase, {
      user_id: userId,
      platform: 'google_docs',
      status: 'syncing',
      last_sync_at: new Date().toISOString(),
    });

    // 1. Search for docs in Google Drive
    const searchUrl = new URL('https://www.googleapis.com/drive/v3/files');
    searchUrl.searchParams.set('q', "mimeType = 'application/vnd.google-apps.document' and trashed = false");
    searchUrl.searchParams.set('fields', 'nextPageToken, files(id, name, modifiedTime, webViewLink)');
    searchUrl.searchParams.set('pageSize', '20');
    if (currentStatus?.cursor) {
      searchUrl.searchParams.set('pageToken', currentStatus.cursor);
    }

    const driveRes = await fetch(searchUrl.toString(), {
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: 'no-store',
    });

    if (!driveRes.ok) {
      throw new Error(`Drive search failed: ${await driveRes.text()}`);
    }

    const driveData = await driveRes.json() as { files?: Array<{ id: string; name: string; modifiedTime: string; webViewLink?: string }>; nextPageToken?: string };
    const files = driveData.files ?? [];
    const nextPageToken = driveData.nextPageToken;

    const memories = [];

    // 2. Fetch body of each doc
    for (const file of files) {
      try {
        const docRes = await fetch(`https://docs.googleapis.com/v1/documents/${file.id}`, {
          headers: { Authorization: `Bearer ${accessToken}` },
          cache: 'no-store',
        });

        if (!docRes.ok) continue;

        const docData = await docRes.json() as { title?: string; body?: { content?: Array<{ paragraph?: { elements?: Array<{ textRun?: { content?: string } }> } }> } };
        let fullText = '';
        const contentElements = docData.body?.content ?? [];
        for (const element of contentElements) {
          const elements = element.paragraph?.elements ?? [];
          for (const textElement of elements) {
            if (textElement.textRun?.content) {
              fullText += textElement.textRun.content;
            }
          }
        }

        memories.push({
          user_id: userId,
          platform: 'google_docs',
          platform_id: file.id,
          event_type: 'document',
          title: file.name,
          content: fullText.trim() || `Google Document: ${file.name}`,
          author: 'Google Drive',
          timestamp: file.modifiedTime,
          metadata: {
            webViewLink: file.webViewLink,
            length: fullText.length,
          },
          is_flagged: false,
          flag_severity: 'LOW',
          flag_reason: null,
        });
      } catch (err) {
        console.warn(`[Google Docs Sync] Failed to parse document ${file.id}:`, err);
      }
    }

    if (memories.length > 0) {
      await upsertRawEventsSafely(supabase, memories);
    }

    const { count: totalMemories } = await supabase
      .from('memories')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId);

    await Promise.all([
      upsertSyncStatusSafely(supabase, {
        user_id: userId,
        platform: 'google_docs',
        status: nextPageToken ? 'syncing' : 'connected',
        sync_progress: nextPageToken ? 50 : 100,
        total_items: (currentStatus?.total_items || 0) + memories.length,
        last_sync_at: new Date().toISOString(),
        next_sync_at: new Date(Date.now() + 1000 * 60 * 30).toISOString(),
        cursor: nextPageToken || null,
        error_message: null,
      }),
      supabase.from('user_profiles').update({
        memories_indexed: totalMemories ?? 0,
        updated_at: new Date().toISOString(),
      }).eq('user_id', userId),
    ]);

    return NextResponse.json({
      ok: true,
      syncedDocuments: memories.length,
      hasMore: !!nextPageToken,
    });
  } catch (error: unknown) {
    console.error('[Google Docs Sync] Fatal Error:', error);
    return NextResponse.json({ error: 'Failed to sync Google Docs.' }, { status: 500 });
  }
}
