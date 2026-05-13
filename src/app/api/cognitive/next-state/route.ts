import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

/**
 * GET /api/cognitive/next-state
 * Forward inference — given the user's current cluster sequence,
 * compute probability distribution over what cluster they'll enter next.
 *
 * Uses a Markov transition matrix built from historical cluster sequences.
 */
export async function GET() {
  const supabase = await createClient();
  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Fetch state vectors ordered by date to build the sequence
  const { data: vectors, error } = await supabase
    .from('state_vectors')
    .select('date, cluster_id')
    .eq('user_id', user.id)
    .not('cluster_id', 'is', null)
    .order('date', { ascending: true });

  if (error || !vectors || vectors.length < 10) {
    return NextResponse.json({ inference: null, reason: 'insufficient_data' });
  }

  // Build transition matrix: transitions[fromCluster][toCluster] = count
  const transitions: Record<string, Record<string, number>> = {};
  for (let i = 0; i < vectors.length - 1; i++) {
    const from = vectors[i].cluster_id as string;
    const to   = vectors[i + 1].cluster_id as string;
    if (!from || !to || from === to) continue;
    if (!transitions[from]) transitions[from] = {};
    transitions[from][to] = (transitions[from][to] ?? 0) + 1;
  }

  // Current cluster = last assigned cluster
  const currentClusterId = vectors[vectors.length - 1]?.cluster_id;
  if (!currentClusterId) return NextResponse.json({ inference: null, reason: 'no_current_cluster' });

  const currentTransitions = transitions[currentClusterId] ?? {};
  const totalTransitions = Object.values(currentTransitions).reduce((a, b) => a + b, 0);

  if (totalTransitions < 2) {
    return NextResponse.json({ inference: null, reason: 'insufficient_transitions' });
  }

  // Compute probabilities
  const probabilities = Object.entries(currentTransitions)
    .map(([clusterId, count]) => ({
      cluster_id:  clusterId,
      probability: Math.round((count / totalTransitions) * 100),
      count,
    }))
    .sort((a, b) => b.probability - a.probability);

  // Fetch cluster labels for readable output
  const clusterIds = probabilities.map(p => p.cluster_id);
  const { data: clusterLabels } = await supabase
    .from('cognitive_clusters')
    .select('id, cluster_label, cluster_description')
    .in('id', clusterIds)
    .eq('user_id', user.id);

  const labelMap: Record<string, { label: string; description: string }> = {};
  for (const c of (clusterLabels ?? [])) {
    labelMap[c.id] = { label: c.cluster_label, description: c.cluster_description };
  }

  // Get current cluster label
  const { data: currentCluster } = await supabase
    .from('cognitive_clusters')
    .select('cluster_label, days_in_cluster')
    .eq('id', currentClusterId)
    .eq('user_id', user.id)
    .maybeSingle();

  const enrichedProbabilities = probabilities.map(p => ({
    ...p,
    cluster_label: labelMap[p.cluster_id]?.label ?? 'Unknown State',
    cluster_description: labelMap[p.cluster_id]?.description ?? '',
  }));

  return NextResponse.json({
    inference: {
      current_cluster_id:    currentClusterId,
      current_cluster_label: currentCluster?.cluster_label ?? 'Current State',
      next_states:           enrichedProbabilities.slice(0, 4),
      total_data_points:     vectors.length,
      transition_confidence: Math.min(1, totalTransitions / 10), // 0-1 confidence
    },
  });
}
