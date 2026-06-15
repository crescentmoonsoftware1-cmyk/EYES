import { NextResponse } from 'next/server';
import { createClient, createAdminClient } from '@/utils/supabase/server';
import { AuditAnalysisService } from '@/services/audit/analysis-pipeline';
import { waitUntil } from '@vercel/functions';

/**
 * API Route to fetch the latest Reputation Audit for the user.
 */
export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: audit, error: fetchError } = await supabase
      .from('reputation_audits')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (fetchError) {
      throw fetchError;
    }

    if (!audit) {
      return NextResponse.json(null);
    }

    // Auto-trigger self-healing: if the audit is pending, it means the webhook
    // was created but the background task got terminated by Vercel's 10s execution limit.
    // We lock it and trigger it now from the current active server session.
    if (audit.status === 'pending') {
      const adminSupabase = await createAdminClient();
      
      // Update status to 'analysis' atomically to prevent double triggers
      const { data: updatedAudit } = await adminSupabase
        .from('reputation_audits')
        .update({ status: 'analysis' })
        .eq('id', audit.id)
        .eq('status', 'pending')
        .select()
        .maybeSingle();

      if (updatedAudit) {
        console.log(`[Audit Latest API] Self-healing triggered: starting analysis for audit ${audit.id} in background...`);
        // Run analysis in background
        waitUntil(
          AuditAnalysisService.runAnalysis(audit.id, user.id).catch(err => {
            console.error('[Audit Latest API] Background self-healing analysis failed:', err);
          })
        );
        // Mutate the local status so the response immediately tells the frontend it is running
        audit.status = 'analysis';
      }
    }

    // Map DB fields to camelCase for the frontend if needed
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
    console.error('[Audit Latest API] Failure:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
