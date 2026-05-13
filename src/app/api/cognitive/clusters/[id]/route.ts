import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

/** PATCH /api/cognitive/clusters/[id] — confirm or reject a draft cluster */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient();
  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const { status, user_label } = body;

  if (!['confirm', 'reject'].includes(status)) {
    return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
  }

  // For confirmed: update the label if provided
  const updatePayload: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };

  if (status === 'confirm' && user_label) {
    updatePayload.cluster_label = user_label;
  }

  if (status === 'reject') {
    // Mark as rejected by prefixing cluster_id
    updatePayload.cluster_id = `rejected_${id}`;
    updatePayload.is_current = false;
  }

  const { error } = await supabase
    .from('cognitive_clusters')
    .update(updatePayload)
    .eq('id', id)
    .eq('user_id', user.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
