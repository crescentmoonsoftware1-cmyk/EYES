import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

/**
 * Remediation API: Resolve or dismiss a flagged item.
 * Currently marks the item as not flagged, effectively removing it 
 * from the attention list.
 */
export async function POST(request: Request) {
  try {
    const { id } = await request.json();
    if (!id) return NextResponse.json({ error: 'Missing item ID' }, { status: 400 });

    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { error: updateError } = await supabase
      .from('memories')
      .update({
        is_flagged: false,
        flag_severity: 'LOW',
      })
      .eq('id', id)
      .eq('user_id', user.id);

    if (updateError) {
      console.error('Remediation error:', updateError);
      return NextResponse.json({ error: 'Failed to remediate item' }, { status: 500 });
    }

    return NextResponse.json({ success: true, id });
  } catch (err) {
    console.error('Remediation API failure:', err);
    return NextResponse.json({ error: 'Neural uplink failure' }, { status: 500 });
  }
}
