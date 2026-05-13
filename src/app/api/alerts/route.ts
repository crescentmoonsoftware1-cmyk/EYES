import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

/**
 * GET /api/alerts — fetch undismissed alerts for the current user
 * PATCH /api/alerts — dismiss an alert by id
 */

export async function GET() {
  const supabase = await createClient();
  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr || !user) return NextResponse.json({ alerts: [] }, { status: 401 });

  const { data: alerts, error } = await supabase
    .from('alerts')
    .select('id, alert_type, title, body, source_memory_id, citation_memory_ids, created_at')
    .eq('user_id', user.id)
    .eq('is_dismissed', false)
    .order('created_at', { ascending: false })
    .limit(20);

  if (error) return NextResponse.json({ alerts: [] });
  return NextResponse.json({ alerts: alerts ?? [] });
}

export async function PATCH(request: Request) {
  const supabase = await createClient();
  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json().catch(() => null);
  const alertId = body?.id;
  if (!alertId) return NextResponse.json({ error: 'Missing alert id' }, { status: 400 });

  const { error } = await supabase
    .from('alerts')
    .update({ is_dismissed: true, dismissed_at: new Date().toISOString() })
    .eq('id', alertId)
    .eq('user_id', user.id); // RLS safety

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
