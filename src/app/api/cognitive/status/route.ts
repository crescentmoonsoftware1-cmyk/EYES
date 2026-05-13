import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

/**
 * GET /api/cognitive/status
 * Returns detected loops and recent drift gaps for the IntelligenceView.
 * Returns empty arrays gracefully if tables don't exist or have no data yet.
 */
export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ loops: [], driftGaps: [] }, { status: 401 });

    const [loopsRes, driftRes] = await Promise.allSettled([
      supabase
        .from('detected_loops')
        .select('id,loop_description,occurrence_count,avg_duration_days,is_active,last_occurrence_at')
        .eq('user_id', user.id)
        .order('is_active', { ascending: false })
        .order('occurrence_count', { ascending: false })
        .limit(10),
      supabase
        .from('drift_snapshots')
        .select('gaps,period_start,period_end,created_at')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .single(),
    ]);

    const loops = loopsRes.status === 'fulfilled' ? (loopsRes.value.data ?? []) : [];
    const driftData = driftRes.status === 'fulfilled' ? driftRes.value.data : null;
    const driftGaps = driftData?.gaps ?? [];

    return NextResponse.json({ loops, driftGaps });
  } catch {
    return NextResponse.json({ loops: [], driftGaps: [] });
  }
}
