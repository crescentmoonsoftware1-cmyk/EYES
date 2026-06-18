import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { invokeModel } from '@/services/ai/ai';

// ─── GET /api/chat/threads ────────────────────────────────────────────────────
// Returns the 30 most recent threads with their messages for the current user.
export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const threadId = new URL(req.url).searchParams.get('threadId');
  if (threadId) {
    // Return single thread
    const result = await supabase
      .from('chat_threads')
      .select(`
        id, title, created_at, updated_at, summary,
        chat_messages ( id, role, content, created_at, message_order )
      `)
      .eq('id', threadId)
      .eq('user_id', user.id)
      .single();

    let thread: any = result.data;
    let error = result.error;

    // Self-healing fallback if database migration 048 has not run yet
    if (error && error.code === '42703') {
      const fallbackResult = await supabase
        .from('chat_threads')
        .select(`
          id, title, created_at, updated_at, summary,
          chat_messages ( id, role, content, created_at )
        `)
        .eq('id', threadId)
        .eq('user_id', user.id)
        .single();
      thread = fallbackResult.data;
      error = fallbackResult.error;
    }

    if (error) {
      console.error('[Chat History] Failed to load single thread:', error.message);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (thread && thread.chat_messages) {
      const sortedMessages = [...thread.chat_messages].sort((a: any, b: any) => {
        if (a.message_order !== undefined && b.message_order !== undefined) {
          return a.message_order - b.message_order;
        }
        return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      });
      thread = { ...thread, chat_messages: sortedMessages };
    }

    return NextResponse.json({ thread });
  }

  // Attempt to select message_order for chronological stability
  const initialResult = await supabase
    .from('chat_threads')
    .select(`
      id, title, created_at, updated_at, summary,
      chat_messages ( id, role, content, created_at, message_order )
    `)
    .eq('user_id', user.id)
    .order('updated_at', { ascending: false })
    .limit(30);

  let threads: any[] | null = initialResult.data;
  let error = initialResult.error;

  // Self-healing fallback if database migration 048 has not run yet
  if (error && error.code === '42703') {
    const fallbackResult = await supabase
      .from('chat_threads')
      .select(`
        id, title, created_at, updated_at, summary,
        chat_messages ( id, role, content, created_at )
      `)
      .eq('user_id', user.id)
      .order('updated_at', { ascending: false })
      .limit(30);
    threads = fallbackResult.data;
    error = fallbackResult.error;
  }

  if (error) {
    console.error('[Chat History] Failed to load threads:', error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Sort messages in-memory to guarantee order stability regardless of identical created_at
  const sortedThreads = (threads ?? []).map((thread) => {
    if (!thread.chat_messages) return thread;
    const sortedMessages = [...thread.chat_messages].sort((a: any, b: any) => {
      if (a.message_order !== undefined && b.message_order !== undefined) {
        return a.message_order - b.message_order;
      }
      return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
    });
    return { ...thread, chat_messages: sortedMessages };
  });

  return NextResponse.json({ threads: sortedThreads });
}

// ─── POST /api/chat/threads ───────────────────────────────────────────────────
// Upserts a thread and its messages.
// Body: { threadId?: string, title?: string, messages: { role, content }[] }
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  if (!body || !Array.isArray(body.messages)) {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
  }

  const { threadId, title, messages } = body as {
    threadId?: string;
    title?: string;
    messages: { role: string; content: string; pending?: boolean }[];
  };

  // 1. Upsert the thread
  let finalThreadId = threadId;

  // Always attempt to upsert the thread since frontend might send a new UUID
  const { data: threadData, error: threadErr } = await supabase
    .from('chat_threads')
    .upsert({
      id: finalThreadId || undefined, // undefined lets DB generate if missing
      user_id: user.id,
      title: title || 'New Chat',
    }, { onConflict: 'id' })
    .select('id')
    .single();

  if (threadErr || !threadData) {
    return NextResponse.json({ error: threadErr?.message ?? 'Failed to upsert thread' }, { status: 500 });
  }
  finalThreadId = threadData.id;

  // 2. Delete existing messages for this thread and re-insert (simple full replace)
  await supabase
    .from('chat_messages')
    .delete()
    .eq('thread_id', finalThreadId)
    .eq('user_id', user.id);

  if (messages.length > 0) {
    const rowsWithOrder = messages.map((m, index) => ({
      thread_id: finalThreadId!,
      user_id: user.id,
      role: m.role,
      content: m.content,
      message_order: index,
    }));

    const { error: insertErr } = await supabase.from('chat_messages').insert(rowsWithOrder);
    
    // Self-healing fallback if database migration 048 has not run yet
    if (insertErr) {
      if (insertErr.code === '42703') {
        const rowsWithoutOrder = messages.map((m) => ({
          thread_id: finalThreadId!,
          user_id: user.id,
          role: m.role,
          content: m.content,
        }));
        const { error: fallbackErr } = await supabase.from('chat_messages').insert(rowsWithoutOrder);
        if (fallbackErr) {
          return NextResponse.json({ error: fallbackErr.message }, { status: 500 });
        }
      } else {
        return NextResponse.json({ error: insertErr.message }, { status: 500 });
      }
    }
  }

  // ─── Index completed chat turns into memories for cross-thread search ───────
  try {
    const { data: existingMemories } = await supabase
      .from('memories')
      .select('source_id')
      .eq('user_id', user.id)
      .eq('platform', 'eyes_chat');

    const existingIds = new Set((existingMemories || []).map((m: any) => m.source_id));

    // Group adjacent user and assistant messages into turns
    for (let i = 0; i < messages.length - 1; i++) {
      const current = messages[i];
      const next = messages[i + 1];
      if (current.role === 'user' && next.role === 'assistant') {
        const sourceId = `eyes_chat_${finalThreadId}_turn_${i}`;
        if (!existingIds.has(sourceId) && next.content && !next.pending) {
          const content = `User: ${current.content}\nEYES: ${next.content}`;
          const title = `Chat Turn: ${current.content.slice(0, 80)}`;

          const embedResult = await invokeModel({
            capability: 'embed',
            messages: [{ role: 'user', content }],
            capture: false,
          });
          const embedding = embedResult && typeof embedResult === 'object' && 'embedding' in embedResult
            ? embedResult.embedding : null;

          if (embedding) {
            await supabase.from('memories').upsert({
              user_id: user.id,
              platform: 'eyes_chat',
              source_id: sourceId,
              event_type: 'chat_turn',
              title,
              content,
              source_url: `/?view=dashboard&threadId=${finalThreadId}`,
              timestamp: new Date().toISOString(),
              embedding: JSON.stringify(embedding),
              metadata: { threadId: finalThreadId, turnIndex: i },
            }, { onConflict: 'user_id,platform,source_id' });
          }
        }
      }
    }
  } catch (err) {
    console.warn('[Chat Indexing] Failed to index chat turns:', err);
  }

  // Fetch the updated thread summary
  const { data: threadSummaryData } = await supabase
    .from('chat_threads')
    .select('summary')
    .eq('id', finalThreadId)
    .single();

  return NextResponse.json({ 
    threadId: finalThreadId, 
    summary: threadSummaryData?.summary || '' 
  });
}

// ─── DELETE /api/chat/threads?threadId=xxx ────────────────────────────────────
export async function DELETE(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const threadId = new URL(req.url).searchParams.get('threadId');
  if (!threadId) {
    return NextResponse.json({ error: 'threadId required' }, { status: 400 });
  }

  const { error } = await supabase
    .from('chat_threads')
    .delete()
    .eq('id', threadId)
    .eq('user_id', user.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
