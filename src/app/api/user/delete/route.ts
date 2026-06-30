
import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

/**
 * GDPR Compliance: The "Kill Switch"
 * Permanently deletes all user data across all tables.
 * Tables cleared: oauth_tokens, raw_events, embeddings, sync_status, user_profiles.
 * Note: auth.users is handled by Supabase but we can trigger it if needed.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function DELETE(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    console.log(`[GDPR-KillSwitch] Wiping all data for user ${user.id}...`);

    // 1. Delete platform connections (tokens)
    const { error: tokenError } = await supabase
      .from('oauth_tokens')
      .delete()
      .eq('user_id', user.id);

    // 2. Delete unified memories (includes embeddings as a column)
    const { error: eventError } = await supabase
      .from('memories')
      .delete()
      .eq('user_id', user.id);

    // 3. Delete chat history
    const { error: embeddingError } = await supabase
      .from('chat_threads')
      .delete()
      .eq('user_id', user.id);

    // 4. Delete sync history and status
    const { error: syncError } = await supabase
      .from('sync_status')
      .delete()
      .eq('user_id', user.id);

    // 5. Delete user profile
    const { error: profileError } = await supabase
      .from('user_profiles')
      .delete()
      .eq('user_id', user.id);

    if (tokenError || eventError || embeddingError || syncError || profileError) {
      console.error('[GDPR-KillSwitch] Cleanup failed partially:', {
        tokenError, eventError, embeddingError, syncError, profileError
      });
      return NextResponse.json({ error: 'Data wipe failed to complete fully.' }, { status: 500 });
    }

    // Optional: Sign out the user
    await supabase.auth.signOut();

    return NextResponse.json({ 
      success: true, 
      message: 'Your archive has been permanently erased. Farewell.' 
    });
  } catch (err) {
    console.error('[GDPR-KillSwitch] Critical failure:', err);
    return NextResponse.json({ error: 'Internal system failure during data wipe.' }, { status: 500 });
  }
}
