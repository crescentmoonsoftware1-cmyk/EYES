import { NextResponse } from 'next/server';

import { getValidGoogleToken } from '@/services/auth/oauth';
import { upsertRawEventsSafely, upsertSyncStatusSafely } from '@/utils/supabase/upsert';
import { resolveSyncActor } from '@/utils/sync/actor';

export async function POST(request: Request) {
  if (process.env.MOCK_MODE === 'true') {
    return NextResponse.json({
      ok: true,
      syncedSpreadsheets: 2,
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
      .eq('platform', 'google_sheets')
      .maybeSingle();

    const accessToken = await getValidGoogleToken(supabase, userId, 'google_sheets');
    if (!accessToken) {
      return NextResponse.json({ error: 'Google Sheets session expired and refresh failed.' }, { status: 401 });
    }

    // Mark as syncing
    await upsertSyncStatusSafely(supabase, {
      user_id: userId,
      platform: 'google_sheets',
      status: 'syncing',
      last_sync_at: new Date().toISOString(),
    });

    // 1. Search for sheets in Google Drive
    const searchUrl = new URL('https://www.googleapis.com/drive/v3/files');
    searchUrl.searchParams.set('q', "mimeType = 'application/vnd.google-apps.spreadsheet' and trashed = false");
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

    // 2. Fetch sheet details and ranges
    for (const file of files) {
      try {
        const metadataRes = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${file.id}`, {
          headers: { Authorization: `Bearer ${accessToken}` },
          cache: 'no-store',
        });

        if (!metadataRes.ok) continue;

        const metadata = await metadataRes.json() as { sheets?: Array<{ properties?: { title?: string } }> };
        const sheetTitle = metadata.sheets?.[0]?.properties?.title || 'Sheet1';

        // Read first 100 rows of first sheet
        const valuesRes = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${file.id}/values/${encodeURIComponent(sheetTitle)}!A1:Z100`, {
          headers: { Authorization: `Bearer ${accessToken}` },
          cache: 'no-store',
        });

        if (!valuesRes.ok) continue;

        const valuesData = await valuesRes.json() as { values?: string[][] };
        const rows = valuesData.values ?? [];
        const contentStr = rows.map(row => row.join(', ')).join('\n');

        memories.push({
          user_id: userId,
          platform: 'google_sheets',
          platform_id: file.id,
          event_type: 'spreadsheet',
          title: file.name,
          content: contentStr.trim() || `Google Spreadsheet: ${file.name}`,
          author: 'Google Drive',
          timestamp: file.modifiedTime,
          metadata: {
            webViewLink: file.webViewLink,
            rowsCount: rows.length,
          },
          is_flagged: false,
          flag_severity: 'LOW',
          flag_reason: null,
        });
      } catch (err) {
        console.warn(`[Google Sheets Sync] Failed to parse sheet ${file.id}:`, err);
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
        platform: 'google_sheets',
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
      syncedSpreadsheets: memories.length,
      hasMore: !!nextPageToken,
    });
  } catch (error: unknown) {
    console.error('[Google Sheets Sync] Fatal Error:', error);
    return NextResponse.json({ error: 'Failed to sync Google Sheets.' }, { status: 500 });
  }
}
