import { NextResponse } from 'next/server';
import { resolveSyncActor } from '@/utils/sync/actor';
import { upsertRawEventsSafely, upsertSyncStatusSafely } from '@/utils/supabase/upsert';

type TrelloCard = {
  id: string; name: string; desc?: string; url?: string;
  dateLastActivity?: string; idBoard: string;
  labels?: Array<{ name: string; color: string }>;
  due?: string | null; dueComplete?: boolean; closed?: boolean;
};
type TrelloBoard = { id: string; name: string; desc?: string; url?: string; lastActivity?: string };

export async function POST(request: Request) {
  const actor = await resolveSyncActor(request);
  if ('status' in actor) return NextResponse.json({ error: actor.error }, { status: actor.status });
  const { supabase, userId } = actor;

  const apiKey = process.env.TRELLO_API_KEY;
  const token = process.env.TRELLO_TOKEN;
  if (!apiKey || !token) return NextResponse.json({ error: 'Trello credentials not configured.' }, { status: 503 });

  try {
    const { data: currentStatus } = await supabase
      .from('sync_status').select('total_items').eq('user_id', userId).eq('platform', 'trello').maybeSingle();

    await upsertSyncStatusSafely(supabase, { user_id: userId, platform: 'trello', status: 'syncing', last_sync_at: new Date().toISOString() });

    const auth = `key=${apiKey}&token=${token}`;
    const url = new URL(request.url);
    const boardLimit = url.searchParams.get('depth') === 'deep' ? 20 : 10;

    const boardsResp = await fetch(
      `https://api.trello.com/1/members/me/boards?${auth}&filter=open&fields=id,name,desc,url,lastActivity`,
      { cache: 'no-store' }
    );
    if (!boardsResp.ok) throw new Error(`Trello boards API (${boardsResp.status})`);
    const boards = (await boardsResp.json()) as TrelloBoard[];

    const events: Record<string, unknown>[] = [];

    for (const board of boards.slice(0, boardLimit)) {
      events.push({
        user_id: userId, platform: 'trello', platform_id: `board_${board.id}`,
        event_type: 'board', title: board.name,
        content: board.desc || `Trello board: ${board.name}`,
        author: 'Trello', timestamp: board.lastActivity || new Date().toISOString(),
        is_flagged: false, flag_severity: 'LOW', flag_reason: null,
        metadata: { board_id: board.id, url: board.url },
      });

      const cardsResp = await fetch(
        `https://api.trello.com/1/boards/${board.id}/cards?${auth}&fields=id,name,desc,url,dateLastActivity,idBoard,labels,due,dueComplete,closed`,
        { cache: 'no-store' }
      );
      if (!cardsResp.ok) continue;
      const cards = (await cardsResp.json()) as TrelloCard[];

      for (const card of cards.filter((c) => !c.closed)) {
        const overdue = card.due && !card.dueComplete && new Date(card.due) < new Date();
        events.push({
          user_id: userId, platform: 'trello', platform_id: `card_${card.id}`,
          event_type: 'card', title: card.name,
          content: card.desc ? `${card.name}: ${card.desc}` : card.name,
          author: 'Trello', timestamp: card.dateLastActivity || new Date().toISOString(),
          is_flagged: Boolean(overdue), flag_severity: overdue ? 'LOW' : 'LOW',
          flag_reason: overdue ? 'Overdue task' : null,
          metadata: { board_id: board.id, board_name: board.name, url: card.url, labels: card.labels, due: card.due, due_complete: card.dueComplete },
        });
      }
    }

    if (events.length > 0) await upsertRawEventsSafely(supabase, events);

    const { count: totalMemories } = await supabase.from('memories').select('id', { count: 'exact', head: true }).eq('user_id', userId);
    const now = new Date().toISOString();
    await Promise.all([
      upsertSyncStatusSafely(supabase, { user_id: userId, platform: 'trello', status: 'connected', sync_progress: 100, total_items: (currentStatus?.total_items ?? 0) + events.length, last_sync_at: now, next_sync_at: new Date(Date.now() + 3600000).toISOString(), error_message: null }),
      supabase.from('user_profiles').update({ memories_indexed: totalMemories ?? events.length, updated_at: now }).eq('user_id', userId),
    ]);

    return NextResponse.json({ success: true, boards: boards.length, count: events.length });
  } catch (err) {
    console.error('[Trello Sync] Error:', err);
    await upsertSyncStatusSafely(supabase, { user_id: userId, platform: 'trello', status: 'error', error_message: String(err).slice(0, 200) });
    return NextResponse.json({ error: 'Trello sync failed' }, { status: 500 });
  }
}
