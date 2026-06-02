import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

/**
 * API Route to check the status of a specific Reputation Audit.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const cleanId = id.trim().toLowerCase();
    let query = supabase
      .from('reputation_audits')
      .select('*')
      .eq('user_id', user.id);

    if (cleanId.length === 8) {
      query = query.like('id', `${cleanId}%`);
    } else {
      query = query.eq('id', cleanId);
    }

    const { data: audit, error: fetchError } = await query.maybeSingle();

    if (fetchError || !audit) {
      return NextResponse.json({ error: 'Audit not found or access denied.' }, { status: 404 });
    }


    // Map DB fields to camelCase for the frontend
    const mappedAudit = {
      id: audit.id,
      status: audit.status,
      riskScore: Number(audit.risk_score || 0),
      mentionsCount: audit.mentions_count || 0,
      commitmentsCount: audit.commitments_count || 0,
      summaryNarrative: audit.summary_narrative,
      connectorsCovered: audit.connectors_covered || [],
      reportUrl: audit.report_url,
      createdAt: audit.created_at,
      metadata: audit.metadata || {}
    };

    return NextResponse.json(mappedAudit);

  } catch (err) {
    console.error('[Audit Status API] Failure:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
