import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

export async function POST() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Danger Zone: Delete all memories (includes embeddings), chat threads, and sync cursors
    const { error: eventError } = await supabase
      .from('memories')
      .delete()
      .eq('user_id', user.id);

    if (eventError) throw eventError;

    const { error: chatError } = await supabase
      .from('chat_threads')
      .delete()
      .eq('user_id', user.id);

    if (chatError) throw chatError;

    const { error: syncError } = await supabase
      .from('sync_status')
      .delete()
      .eq('user_id', user.id);

    if (syncError) throw syncError;

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to wipe archive:', error);
    return NextResponse.json({ error: 'Failed to wipe archive' }, { status: 500 });
  }
}
