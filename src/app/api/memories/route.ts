import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

export const dynamic = 'force-dynamic';

const PAGE_SIZE = 50;

export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authErr } = await supabase.auth.getUser();
    if (authErr || !user) {
      return NextResponse.json({ items: [], nextCursor: null, total: 0 }, { status: 200 });
    }

    const { searchParams } = new URL(req.url);
    const cursor = searchParams.get('cursor');        // ISO timestamp of last item
    const platform = searchParams.get('platform');    // optional platform filter

    // ── Build query ────────────────────────────────────────────────────────────
    let query = supabase
      .from('memories')
      .select('id, platform, title, content, timestamp, event_type, author, is_flagged, flag_severity, flag_reason')
      .eq('user_id', user.id)
      .not('content', 'is', null)
      .order('timestamp', { ascending: false })
      .limit(PAGE_SIZE);

    // Apply platform filter
    if (platform && platform !== 'all') {
      // Handle both hyphen (UI) and underscore (DB) formats
      const dbPlatform = platform.replace(/-/g, '_');
      query = query.or(`platform.eq.${platform},platform.eq.${dbPlatform}`);
    }

    // Apply cursor (timestamp-based keyset pagination)
    if (cursor) {
      query = query.lt('timestamp', cursor);
    }

    const { data: rows, error } = await query;
    if (error) {
      console.error('[Memories API]', error);
      return NextResponse.json({ items: [], nextCursor: null, total: 0 }, { status: 500 });
    }

    const items = (rows ?? []).map(row => ({
      id: row.id,
      platform: row.platform,
      title: row.title,
      content: row.content,
      timestamp: row.timestamp,
      author: row.author,
      is_flagged: Boolean(row.is_flagged),
      flag_severity: row.flag_severity,
      flag_reason: row.flag_reason,
      event_type: row.event_type,
    }));

    // nextCursor = timestamp of the last item returned — null if this is the last page
    const nextCursor = items.length === PAGE_SIZE
      ? (items[items.length - 1].timestamp ?? null)
      : null;

    const res = NextResponse.json({ items, nextCursor });
    res.headers.set('Cache-Control', 'private, no-store');
    return res;

  } catch (err) {
    console.error('[Memories API] Fatal:', err);
    return NextResponse.json({ items: [], nextCursor: null }, { status: 500 });
  }
}
