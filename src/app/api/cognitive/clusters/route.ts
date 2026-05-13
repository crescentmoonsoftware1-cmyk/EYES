import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

/** GET /api/cognitive/clusters?status=draft|confirmed|all */
export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr || !user) return NextResponse.json({ clusters: [] }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const status = searchParams.get('status') ?? 'all';

  let query = supabase
    .from('cognitive_clusters')
    .select('id, cluster_id, cluster_label, cluster_description, characteristics, occurrence_count, is_current, cluster_version, updated_at')
    .eq('user_id', user.id)
    .order('cluster_version', { ascending: false })
    .order('occurrence_count', { ascending: false })
    .limit(20);

  // Filter by status stored in cluster_label prefix convention
  // We use cluster_description as a proxy — confirmed clusters have user_label set
  // For simplicity: draft = no user_label prefix, confirmed = has been acknowledged
  // We track status via a naming convention on cluster_id for now
  if (status === 'draft') {
    query = query.ilike('cluster_id', 'cluster-v%');
  }

  const { data: clusters, error } = await query;
  if (error) return NextResponse.json({ clusters: [] });
  return NextResponse.json({ clusters: clusters ?? [] });
}
