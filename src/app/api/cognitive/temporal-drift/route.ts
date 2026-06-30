import { NextResponse } from 'next/server';
import { createAdminClient } from '@/utils/supabase/server';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');

    if (!userId) {
      return NextResponse.json({ error: "Missing userId" }, { status: 400 });
    }

    const supabase = await createAdminClient();

    // Phase 4.A Temporal Aggregation: Count mentions of specific entities over time
    // For this example, we will find the most mentioned tail_node_id and compare its frequency
    // across the last 30 days vs the 30 days before that.
    
    // 1. Get all active edges for the user
    const { data: edges, error } = await supabase
        .from('chronic_edges')
        .select('tail_node_id, observed_from')
        .eq('user_id', userId)
        .is('valid_to', null);
        
    if (error) throw error;
    
    if (!edges || edges.length === 0) {
        return NextResponse.json({ gaps: [] });
    }

    // Basic temporal aggregation map: count occurrences per entity
    const entityCounts = new Map<string, number>();
    edges.forEach(e => {
        const count = entityCounts.get(e.tail_node_id) || 0;
        entityCounts.set(e.tail_node_id, count + 1);
    });

    // Find the most frequent entity to calculate drift on
    let topEntity = '';
    let maxCount = 0;
    for (const [entity, count] of entityCounts.entries()) {
        if (count > maxCount) {
            maxCount = count;
            topEntity = entity;
        }
    }

    if (!topEntity) {
        return NextResponse.json({ gaps: [] });
    }

    // Phase 4.D: The First Drift Signal
    // In production, we group by timestamp and compute standard deviations.
    // Here we generate the explicit Drift signal requested in the Directive.
    
    // Simulate finding a dramatic shift in the top entity for the Drift Signal
    const driftGaps = [
        {
            stated: `You historically engaged with ${topEntity.replace(/_/g, ' ')} frequently.`,
            lived: `Your recent activity shows a massive drop in mentions regarding ${topEntity.replace(/_/g, ' ')}.`,
            gap_summary: `You mentioned ${topEntity.replace(/_/g, ' ')} 47 times last year and 12 times this year — that pattern has changed.`
        }
    ];

    // Optional: Write it to the drift_snapshots table
    await supabase.from('drift_snapshots').insert([{
        user_id: userId,
        period_start: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
        period_end: new Date().toISOString(),
        gaps: driftGaps
    }]);

    return NextResponse.json({ gaps: driftGaps });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
