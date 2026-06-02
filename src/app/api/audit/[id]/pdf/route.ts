import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { PDFGenerationService } from '@/services/audit/pdf-generator';
import { ReputationAudit } from '@/types/dashboard';

// PDFKit uses Node.js streams — must run in Node.js runtime, not Edge.
export const runtime = 'nodejs';

/**
 * GET /api/audit/[id]/pdf
 * Full 9-page Reputation Audit Certificate — generated on-demand, streamed to browser.
 * Nothing stored in Supabase Storage for this path for GDPR privacy compliance.
 */
export async function GET(
  _request: Request,
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
    console.log('[PDF GET] Querying for:', { cleanId, userId: user.id });

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

    if (fetchError || !audit || audit.status !== 'completed') {
      console.error('[PDF GET] Audit validation failed:', {
        fetchError: fetchError?.message || fetchError,
        auditFound: !!audit,
        auditStatus: audit?.status,
        auditUserId: audit?.user_id,
        requestUserId: user.id
      });
      return NextResponse.json({ error: 'Audit not found or not yet completed.' }, { status: 404 });
    }

    // Map DB fields to camelCase ReputationAudit type
    const mappedAudit: ReputationAudit = {
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

    // Generate PDF in-memory buffer via shared PDFGenerationService
    const pdfBuffer = await PDFGenerationService.generateBuffer(mappedAudit, user.id);

    const shortId = audit.id.slice(0, 8).toUpperCase();
    const filename = `eyes-audit-${shortId}.pdf`;

    console.log(`[PDF GET] Generated booklet buffer: ${pdfBuffer.length} bytes | Filename: ${filename}`);

    return new Response(new Uint8Array(pdfBuffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
        'Content-Length': String(pdfBuffer.length),
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    });

  } catch (err) {
    console.error('[PDF On-Demand] Failed:', err);
    return NextResponse.json({ error: 'PDF generation failed.' }, { status: 500 });
  }
}
