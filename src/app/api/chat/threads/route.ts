import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

// ─── GET /api/chat/threads ────────────────────────────────────────────────────
// Returns the 30 most recent threads with their messages for the current user.
export async function GET() {
  const supabase = await createClient();
  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data: threads, error } = await supabase
    .from('chat_threads')
    .select(`
      id, title, created_at, updated_at,
      chat_messages ( id, role, content, created_at )
    `)
    .eq('user_id', user.id)
    .order('updated_at', { ascending: false })
    .limit(30);

  if (error) {
    console.error('[Chat History] Failed to load threads:', error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ threads: threads ?? [] });
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
    messages: { role: string; content: string }[];
  };

  // 1. Upsert the thread
  let finalThreadId = threadId;
  if (!finalThreadId) {
    const { data: newThread, error: threadErr } = await supabase
      .from('chat_threads')
      .insert({
        user_id: user.id,
        title: title || 'New Chat',
      })
      .select('id')
      .single();

    if (threadErr || !newThread) {
      return NextResponse.json({ error: threadErr?.message ?? 'Failed to create thread' }, { status: 500 });
    }
    finalThreadId = newThread.id;
  } else if (title) {
    // Update title if provided
    await supabase
      .from('chat_threads')
      .update({ title })
      .eq('id', finalThreadId)
      .eq('user_id', user.id);
  }

  // 2. Delete existing messages for this thread and re-insert (simple full replace)
  await supabase
    .from('chat_messages')
    .delete()
    .eq('thread_id', finalThreadId)
    .eq('user_id', user.id);

  if (messages.length > 0) {
    const rows = messages.map((m) => ({
      thread_id: finalThreadId!,
      user_id: user.id,
      role: m.role,
      content: m.content,
    }));

    const { error: insertErr } = await supabase.from('chat_messages').insert(rows);
    if (insertErr) {
      return NextResponse.json({ error: insertErr.message }, { status: 500 });
    }
  }

  return NextResponse.json({ threadId: finalThreadId });
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
