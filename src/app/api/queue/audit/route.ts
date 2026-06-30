import { NextResponse } from 'next/server';
import { verifySignatureAppRouter } from '@upstash/qstash/dist/nextjs';
import { AuditAnalysisService } from '@/services/audit/analysis-pipeline';
import { createAdminClient } from '@/utils/supabase/server';

// QStash workers can run for extended periods — allow full Vercel Pro timeout


export const dynamic = 'force-dynamic';

async function handler(request: Request) {
  try {
    const body = await request.json();
    const { auditId, userId } = body;

    if (!auditId || !userId) {
      console.error('[Queue: Audit] Missing auditId or userId', body);
      return NextResponse.json({ error: 'Missing parameters' }, { status: 400 });
    }

    console.log(`[Queue: Audit] Starting background audit for user ${userId}, audit ${auditId}`);
    
    // Check if audit is still valid
    const supabase = await createAdminClient();
    const { data: audit, error: auditError } = await supabase
      .from('reputation_audits')
      .select('status')
      .eq('id', auditId)
      .single();

    if (auditError || !audit) {
      console.error(`[Queue: Audit] Audit ${auditId} not found or error`, auditError);
      return NextResponse.json({ error: 'Audit not found' }, { status: 404 });
    }

    if (audit.status === 'completed' || audit.status === 'error') {
      console.log(`[Queue: Audit] Audit ${auditId} already ${audit.status}, skipping.`);
      return NextResponse.json({ success: true, message: 'Already processed' });
    }

    // Run the heavy analysis pipeline. This can take up to the QStash timeout (hours).
    await AuditAnalysisService.runAnalysis(auditId, userId);

    console.log(`[Queue: Audit] Successfully completed audit ${auditId}`);
    return NextResponse.json({ success: true });

  } catch (err) {
    console.error('[Queue: Audit] FATAL ERROR:', err);
    return NextResponse.json({ error: 'Processing failed', detail: String(err) }, { status: 500 });
  }
}

// verifySignatureAppRouter protects this endpoint so ONLY Upstash can call it
export const POST = verifySignatureAppRouter(handler, {
  currentSigningKey: process.env.QSTASH_CURRENT_SIGNING_KEY || 'dummy_build_key',
  nextSigningKey: process.env.QSTASH_NEXT_SIGNING_KEY || 'dummy_build_key'
});
