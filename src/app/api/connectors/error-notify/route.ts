import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { sendConnectorErrorEmail } from '@/services/email/resend';

/**
 * POST /api/connectors/error-notify
 * Called internally when a sync job receives a 401 from a platform.
 * Sends a transactional email to the user to reconnect their account.
 * Body: { platform: string }
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { platform } = await request.json() as { platform?: string };
  if (!platform) return NextResponse.json({ error: 'Missing platform' }, { status: 400 });

  const email = user.email ?? '';
  const name = user.user_metadata?.full_name
    ?? user.user_metadata?.name
    ?? email.split('@')[0]
    ?? 'there';

  // Fire-and-forget — don't block the sync response
  sendConnectorErrorEmail(email, name, platform);

  return NextResponse.json({ sent: true });
}
