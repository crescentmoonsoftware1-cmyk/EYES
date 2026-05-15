import { NextResponse } from 'next/server';
import { createClient, createAdminClient } from '@/utils/supabase/server';
import { AuditAnalysisService } from '@/services/audit/analysis-pipeline';
import { waitUntil } from '@vercel/functions';

/**
 * API Route to initiate a Reputation Audit.
 */
export async function POST(request: Request) {
  try {
    const userClient = await createClient();
    const { data: { user }, error: authError } = await userClient.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Use Admin Client for database operations to bypass RLS barriers
    const supabase = await createAdminClient();

    // 1. Create the pending audit record (Step 1)
    const { data: audit, error: createError } = await supabase
      .from('reputation_audits')
      .insert({
        user_id: user.id,
        status: 'pending'
      })
      .select()
      .single();

    if (createError || !audit) {
      throw new Error(`Failed to create audit record: ${createError?.message}`);
    }

    // 2. Update status to 'analysis' 
    await supabase
      .from('reputation_audits')
      .update({ status: 'analysis' })
      .eq('id', audit.id);

    // 3. RUN ANALYSIS (Background - use waitUntil to prevent Vercel from killing the process)
    waitUntil(AuditAnalysisService.runAnalysis(audit.id, user.id));

    return NextResponse.json({
      success: true,
      auditId: audit.id,
      status: 'analysis',
      message: 'Neural reputation audit initiated.'
    });

  } catch (err) {
    console.error('[Audit API] Initialization failure:', err);
    return NextResponse.json({ 
      error: 'Unable to initiate audit.', 
      detail: err instanceof Error ? err.message : String(err) 
    }, { status: 500 });
  }
}
