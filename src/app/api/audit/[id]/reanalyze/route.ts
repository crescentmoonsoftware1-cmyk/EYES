import { NextResponse } from 'next/server';
import { createClient, createAdminClient } from '@/utils/supabase/server';
import { AuditAnalysisService } from '@/services/audit/analysis-pipeline';

export const dynamic = 'force-dynamic';

/**
 * POST /api/audit/[id]/reanalyze
 * Re-runs the AI extraction pipeline on an existing completed audit.
 * Useful when the initial run produced empty commitments/findings due to model failures.
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> | { id: string } }
) {
  try {
    const resolvedParams = await params;
    const id = resolvedParams?.id;
    if (!id) {
      return NextResponse.json({ error: 'Audit ID parameter is missing.' }, { status: 400 });
    }

    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      console.warn('[Reanalyze API] Unauthorized attempt detected:', authError);
      return NextResponse.json({ error: 'Unauthorized', detail: authError?.message }, { status: 401 });
    }

    // Verify ownership using user client
    const { data: audit, error: fetchError } = await supabase
      .from('reputation_audits')
      .select('id, status, user_id, metadata')
      .eq('id', id)
      .eq('user_id', user.id)
      .single();

    if (fetchError || !audit) {
      console.warn(`[Reanalyze API] Audit not found or access denied for ID ${id}:`, fetchError);
      return NextResponse.json({ error: 'Audit not found.' }, { status: 404 });
    }

    if (audit.status === 'analysis') {
      return NextResponse.json({ error: 'Audit is already running.' }, { status: 409 });
    }

    const auditType = (audit.metadata as Record<string, any>)?.audit_type || 'full';

    // Switch to Admin Client for database operations (RLS bypass) to avoid any potential update permissions issues
    const adminSupabase = await createAdminClient();

    // Reset to analysis state, preserving audit_type
    const { error: updateError } = await adminSupabase
      .from('reputation_audits')
      .update({ status: 'analysis', metadata: { audit_type: auditType } })
      .eq('id', id);

    if (updateError) {
      console.error(`[Reanalyze API] Failed to reset audit status to analysis for ID ${id}:`, updateError);
      return NextResponse.json({ error: 'Failed to update audit status.' }, { status: 500 });
    }

    // Run analysis in background — don't await (static method)
    AuditAnalysisService.runAnalysis(id, user.id).catch((err: unknown) =>
      console.error(`[Reanalyze] Background failure for ${id}:`, err)
    );

    console.log(`[Reanalyze] Re-analysis triggered successfully for audit ${id} by user ${user.id}`);
    return NextResponse.json({ message: 'Re-analysis started.', auditId: id });
  } catch (err) {
    console.error('[Reanalyze API] Internal crash:', err);
    return NextResponse.json({
      error: 'Failed to start re-analysis.',
      detail: err instanceof Error ? err.message : String(err)
    }, { status: 500 });
  }
}

