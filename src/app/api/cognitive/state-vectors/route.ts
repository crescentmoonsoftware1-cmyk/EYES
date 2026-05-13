import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

/** GET /api/cognitive/state-vectors?days=90 */
export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr || !user) return NextResponse.json({ vectors: [] }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const days = Math.min(parseInt(searchParams.get('days') ?? '90'), 365);
  const since = new Date(Date.now() - days * 86400000).toISOString().split('T')[0];

  const { data: vectors, error } = await supabase
    .from('state_vectors')
    .select('id, date, cluster_id, dominant_topic, message_volume, sentiment_score, topic_entropy')
    .eq('user_id', user.id)
    .gte('date', since)
    .order('date', { ascending: true });

  if (error) return NextResponse.json({ vectors: [] });
  return NextResponse.json({ vectors: vectors ?? [] });
}
