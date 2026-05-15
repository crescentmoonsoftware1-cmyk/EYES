import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

/**
 * API Route to fetch all Reputation Audits for the user.
 */
export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ audits: [] }, { status: 200 });
    }

    const { data: audits, error: fetchError } = await supabase
      .from('reputation_audits')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (fetchError) {
      throw fetchError;
    }

    const mappedAudits = (audits || []).map(audit => ({
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
    }));

    return NextResponse.json({ audits: mappedAudits });

  } catch (err) {
    console.error('[Audit History API] Failure:', err);
    return NextResponse.json({ audits: [] }, { status: 200 });
  }
}
