import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');

    // 1. Fetch raw edges from chronic_edges
    let query = supabase.from('chronic_edges').select('*').limit(100);
    if (userId) query = query.eq('user_id', userId);
    
    const { data: edges, error: edgeError } = await query;
    if (edgeError) throw edgeError;

    // 2. Fetch Entity Correlations (from Splink Batch) to merge duplicate nodes
    let corrQuery = supabase.from('entity_correlations').select('*');
    if (userId) corrQuery = corrQuery.eq('user_id', userId);
    const { data: correlations } = await corrQuery;

    // Mapping duplicate nodes to their cluster name
    const nodeMap = new Map<string, string>();
    if (correlations) {
        correlations.forEach(c => {
            nodeMap.set(c.entity_id, c.entity_name);
        });
    }

    // 3. Format graph for frontend
    const nodes = new Set<string>();
    const graphEdges = (edges || []).map(e => {
        const head = nodeMap.get(e.head_node_id) || e.head_node_id;
        const tail = nodeMap.get(e.tail_node_id) || e.tail_node_id;
        
        nodes.add(head);
        nodes.add(tail);
        
        return {
            source: head,
            target: tail,
            label: e.relation_label,
            confidence: e.confidence
        };
    });

    const graphNodes = Array.from(nodes).map(id => ({
        id,
        label: id.replace(/_/g, ' ')
    }));

    return NextResponse.json({
      nodes: graphNodes,
      edges: graphEdges,
      merged_nodes_count: correlations?.length || 0
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
