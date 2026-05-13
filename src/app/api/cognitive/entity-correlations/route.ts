import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

/**
 * GET /api/cognitive/entity-correlations
 * Computes which people/orgs/tools co-occur with which cognitive clusters.
 * Returns sorted entity correlations for the People & Places tab.
 *
 * Lift score formula:
 *   lift = P(cluster | entity mentioned) / P(cluster)
 *   > 1.0 = entity is associated with this cluster above baseline
 */
export async function GET() {
  const supabase = await createClient();
  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Fetch all state vectors with cluster assignments
  const { data: vectors, error: vecErr } = await supabase
    .from('state_vectors')
    .select('id, date, cluster_id')
    .eq('user_id', user.id)
    .not('cluster_id', 'is', null);

  if (vecErr || !vectors?.length) return NextResponse.json({ correlations: [] });

  const totalDays = vectors.length;

  // Cluster frequency baseline: P(cluster)
  const clusterFreq: Record<string, number> = {};
  for (const v of vectors) {
    if (v.cluster_id) clusterFreq[v.cluster_id] = (clusterFreq[v.cluster_id] ?? 0) + 1;
  }

  // Build date → cluster_id map
  const dateToCluster: Record<string, string> = {};
  for (const v of vectors) {
    if (v.cluster_id) dateToCluster[v.date] = v.cluster_id;
  }

  // Fetch entities for this user
  const { data: entities, error: entErr } = await supabase
    .from('entities')
    .select('id, canonical_id, name, entity_type')
    .eq('user_id', user.id)
    .limit(200);

  if (entErr || !entities?.length) return NextResponse.json({ correlations: [] });

  // For each entity, find days it was mentioned and what cluster those days were in
  const correlations: Array<{
    entity_id: string;
    entity_name: string;
    entity_type: string;
    cluster_id: string;
    lift_score: number;
    sample_size: number;
  }> = [];

  for (const entity of entities) {
    // Find memories mentioning this entity
    const { data: mentions } = await supabase
      .from('memories')
      .select('date_bucket')
      .eq('user_id', user.id)
      .contains('entities_extracted', [{ canonical_id: entity.canonical_id }])
      .not('date_bucket', 'is', null)
      .limit(100);

    if (!mentions?.length) continue;

    // For each mention date, find cluster
    const clusterCoOccurrence: Record<string, number> = {};
    let matched = 0;
    for (const m of mentions) {
      const clusterId = dateToCluster[m.date_bucket];
      if (clusterId) {
        clusterCoOccurrence[clusterId] = (clusterCoOccurrence[clusterId] ?? 0) + 1;
        matched++;
      }
    }

    if (matched < 2) continue;

    // Compute lift for each cluster this entity co-occurs with
    for (const [clusterId, coCount] of Object.entries(clusterCoOccurrence)) {
      const pClusterGivenEntity = coCount / matched;
      const pCluster = (clusterFreq[clusterId] ?? 0) / totalDays;
      if (pCluster === 0) continue;
      const lift = Math.round((pClusterGivenEntity / pCluster) * 100) / 100;

      if (lift > 1.2 && coCount >= 2) { // meaningful threshold
        correlations.push({
          entity_id:   entity.id,
          entity_name: entity.name,
          entity_type: entity.entity_type,
          cluster_id:  clusterId,
          lift_score:  lift,
          sample_size: matched,
        });

        // Upsert to entity_correlations table
        await supabase
          .from('entity_correlations')
          .upsert({
            user_id:     user.id,
            entity_id:   entity.id,
            cluster_id:  clusterId,
            lift_score:  lift,
            sample_size: matched,
            computed_at: new Date().toISOString(),
          }, { onConflict: 'entity_id,cluster_id' });
      }
    }
  }

  // Sort by lift descending
  correlations.sort((a, b) => b.lift_score - a.lift_score);

  return NextResponse.json({ correlations: correlations.slice(0, 50) });
}
