import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

/**
 * GET /api/audit/[id]/stage
 * Returns the current stage and status of an audit for the Thinking Veil to poll.
 * Response: { stage, status, recordCount?, error? }
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const supabase = await createClient();
  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data, error } = await supabase
    .from('reputation_audits')
    .select('status, stage, metadata')
    .eq('id', id)
    .eq('user_id', user.id)
    .single();

  if (error || !data) {
    return NextResponse.json({ error: 'Audit not found' }, { status: 404 });
  }

  // Map DB status + stage to veil stage
  let veilStage = (data.stage as string) || 'pending';
  if (data.status === 'completed') veilStage = 'completed';
  if (data.status === 'failed')    veilStage = 'failed';

  const recordCount = (data.metadata as Record<string, unknown>)?.record_count as number | undefined;
  const errorMsg    = (data.metadata as Record<string, unknown>)?.error as string | undefined;

  return NextResponse.json({
    stage: veilStage,
    status: data.status,
    ...(recordCount ? { recordCount } : {}),
    ...(errorMsg    ? { error: errorMsg } : {}),
  });
}
