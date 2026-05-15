import { NextResponse } from 'next/server';
import { createClient, createAdminClient } from '@/utils/supabase/server';
import { AuditAnalysisService } from '@/services/audit/analysis-pipeline';
import { waitUntil } from '@vercel/functions';

/**
 * API Route to initiate a Reputation Audit.
 * Uses the Admin Client to bypass RLS and ensure background persistence.
 */
export async function POST(request: Request) {
  console.log('[Audit API] Received request to create audit...');
  
  try {
    // 1. Authenticate the user session using the standard client
    const userClient = await createClient();
    const { data: { user }, error: authError } = await userClient.auth.getUser();

    if (authError || !user) {
      console.warn('[Audit API] Unauthorized attempt detected.');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    console.log(`[Audit API] Authenticated User: ${user.id}`);

    // 2. Switch to Admin Client for database operations (RLS bypass)
    const supabase = await createAdminClient();

    // 3. Create the pending audit record
    const { data: audit, error: createError } = await supabase
      .from('reputation_audits')
      .insert({
        user_id: user.id,
        status: 'pending'
      })
      .select()
      .single();

    if (createError || !audit) {
      console.error('[Audit API] Database Insert Failed:', createError);
      throw new Error(`Failed to create audit record: ${createError?.message}`);
    }

    console.log(`[Audit API] Record Created: ${audit.id}. Moving to analysis stage...`);

    // 4. Update status to 'analysis' 
    await supabase
      .from('reputation_audits')
      .update({ status: 'analysis' })
      .eq('id', audit.id);

    // 5. RUN ANALYSIS (Background - fire and forget via waitUntil)
    // We do NOT await this because we want to return a response to the user immediately
    waitUntil(AuditAnalysisService.runAnalysis(audit.id, user.id));

    return NextResponse.json({
      success: true,
      auditId: audit.id,
      status: 'analysis',
      message: 'Neural reputation audit initiated successfully.'
    });

  } catch (err) {
    console.error('[Audit API] PRODUCTION CRASH:', err);
    return NextResponse.json({ 
      error: 'Neural execution failed.', 
      detail: err instanceof Error ? err.message : String(err) 
    }, { status: 500 });
  }
}
