import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import PDFDocument from 'pdfkit';

/**
 * GET /api/audit/[id]/pdf
 * Full 8-page Reputation Audit Certificate — generated on-demand, streamed to browser.
 * Nothing stored in Supabase Storage.
 *
 * Page 1: Cover Page
 * Page 2: Executive Summary & Core Metrics
 * Pages 3–5: Per-Connector Breakdown (up to 3 platforms)
 * Page 6: Commitments & Opportunities
 * Page 7: Risk Findings
 * Page 8: Citations Index & Legal Notice
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

    const { data: audit, error: fetchError } = await supabase
      .from('reputation_audits')
      .select('*')
      .eq('id', id)
      .eq('user_id', user.id)
      .single();

    if (fetchError || !audit || audit.status !== 'completed') {
      return NextResponse.json({ error: 'Audit not found or not yet completed.' }, { status: 404 });
    }

    const meta = audit.metadata || {};

    interface AuditCommitment {
      text?: string;
      platform?: string;
      status?: string;
      citation?: string;
      date?: string;
    }
    interface AuditRiskFinding {
      severity?: string;
      finding?: string;
      impact?: string;
      evidence?: string;
    }

    const commitments: AuditCommitment[] = meta.commitments  || [];
    const riskFindings: AuditRiskFinding[] = meta.riskFindings || [];
    const topEntities: string[] = meta.topEntities  || [];
    const opportunities: string[] = meta.opportunities || [];
    const connectors: string[] = audit.connectors_covered || [];

    // ── Fetch real memory records per platform for Significant Records section ──
    // Done BEFORE the PDF Promise since it's async
    const platformMemories: Record<string, { title: string; content: string; timestamp: string }[]> = {};
    for (const platform of connectors.slice(0, 3)) {
      const { data: mems } = await supabase
        .from('memories')
        .select('title, content, timestamp')
        .eq('user_id', user.id)
        .eq('platform', platform)
        .not('content', 'is', null)
        .order('timestamp', { ascending: false })
        .limit(3);
      platformMemories[platform] = (mems ?? []).map(m => ({
        title: m.title ?? '',
        content: m.content ?? '',
        timestamp: m.timestamp ?? '',
      }));
    }

    // ── Generate PDF in-memory ────────────────────────────────────────────
    const chunks: Buffer[] = [];

    await new Promise<void>((resolve, reject) => {
      const doc = new PDFDocument({ size: 'A4', margin: 0, info: {
        Title: `Reputation Audit Certificate – ${audit.id}`,
        Author: 'EYES Neural Memory OS',
        Subject: 'Reputation Audit Report',
        Keywords: 'reputation, audit, neural, EYES',
      }});

      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('end', resolve);
      doc.on('error', reject);

      const W = doc.page.width;
      const H = doc.page.height;

      // ── Design Tokens ─────────────────────────────────────────────────
      const FONT_BODY = 'Helvetica';
      const FONT_BOLD = 'Helvetica-Bold';
      const FONT_MONO = 'Courier';
      const BG        = '#FFFFFF';
      const INK       = '#080808';
      const GREEN     = '#00899B';
      const RED       = '#EF4444';
      const GRAY      = '#888888';
      const LIGHT     = '#F0F0F0';
      const AMBER     = '#B8860B';

      const bg = () => doc.rect(0, 0, W, H).fill(BG);

      const footer = (n: number) =>
        doc.fillColor(GRAY).fontSize(7).font(FONT_BODY)
           .text(`Audit ID: ${audit.id} | Page ${n} of 8 | Confidential — EYES Neural Memory OS`,
                 50, H - 40, { align: 'center', width: W - 100 });

      const hRule = (y: number, color = LIGHT) =>
        doc.moveTo(50, y).lineTo(W - 50, y).strokeColor(color).lineWidth(0.5).stroke();

      const renderMetric = (label: string, value: string, y: number) => {
        doc.font(FONT_BODY).fontSize(10).fillColor(INK).text(`• ${label}:`, 65, y, { width: 170 });
        doc.font(FONT_BOLD).fontSize(10).fillColor(INK).text(value, 245, y);
      };

      // ══════════════════════════════════════════════════════════════════
      // PAGE 1 — COVER
      // ══════════════════════════════════════════════════════════════════
      bg();
      doc.fillColor(INK).fontSize(14).font(FONT_BOLD).text('EYES', 50, 40);
      doc.fillColor(RED).fontSize(8).font(FONT_BOLD)
         .text('CONFIDENTIAL · CERTIFICATE', 50, 40, { align: 'right', width: W - 100 });
      hRule(62, INK);

      doc.fillColor(INK).font(FONT_BOLD).fontSize(36)
         .text('Reputation\nAudit\nCertificate', 50, 130, { lineGap: 8 });
      doc.moveTo(50, 270).lineTo(200, 270).strokeColor(GREEN).lineWidth(3).stroke();

      const date = new Date(audit.created_at);
      const dateStr = date.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
      const timeStr = `${String(date.getUTCHours()).padStart(2, '0')}:${String(date.getUTCMinutes()).padStart(2, '0')} UTC`;

      doc.fontSize(12).font(FONT_BODY).fillColor(INK)
         .text(`Date: ${dateStr} · ${timeStr}`, 50, 295)
         .text(`Audit ID: EYES-RA-${audit.id.slice(0, 8).toUpperCase()}`, 50, 318)
         .text(`Risk Score: ${audit.risk_score ?? 'N/A'} / 10`, 50, 341)
         .text(`Records Analysed: ${audit.mentions_count ?? 0}`, 50, 364);

      doc.fontSize(10).font(FONT_BOLD).text('Connectors Covered', 50, 410);
      doc.fontSize(10).font(FONT_BODY).text(connectors.join(' · ') || 'N/A', 50, 428, { width: W - 100 });
      footer(1);

      // ══════════════════════════════════════════════════════════════════
      // PAGE 2 — EXECUTIVE SUMMARY & CORE METRICS
      // ══════════════════════════════════════════════════════════════════
      doc.addPage(); bg();
      doc.fillColor(INK).font(FONT_BOLD).fontSize(22).text('Executive Summary', 50, 80);
      hRule(110);

      const narrative = audit.summary_narrative || 'Analysis complete. No significant anomalies detected at this threshold.';
      doc.font(FONT_BODY).fontSize(11).lineGap(4).fillColor(INK)
         .text(narrative, 50, 125, { width: W - 100, align: 'justify' });

      let y2 = 330;
      hRule(y2); y2 += 20;
      doc.font(FONT_BOLD).fontSize(14).fillColor(INK).text('Key Metrics', 50, y2); y2 += 28;

      renderMetric('Total Records Audited',    String(audit.mentions_count ?? 0),          y2);
      renderMetric('Negative Findings',         String(riskFindings.length),                y2 + 22);
      renderMetric('Failure Rate',              `${meta.failureRate ?? '0'}%`,              y2 + 44);
      renderMetric('Compliance Rate',           `${meta.complianceRate ?? '100'}%`,        y2 + 66);
      renderMetric('Open Commitments',          String(audit.commitments_count ?? 0),      y2 + 88);
      renderMetric('Risk Profile',              `${audit.risk_score ?? 0} / 10`,           y2 + 110);

      // Risk score callout
      const rsY = y2 + 150;
      doc.fontSize(36).font(FONT_BOLD).fillColor(INK).text(String(audit.risk_score ?? 0), 50, rsY);
      doc.fontSize(14).font(FONT_BODY).fillColor(GRAY).text('/ 10  Risk Score', 120, rsY + 10);
      const label = (audit.risk_score ?? 0) > 7 ? 'Critical Risk' : (audit.risk_score ?? 0) > 4 ? 'Moderate Exposure' : 'Minimal Exposure';
      doc.fontSize(10).font(FONT_BODY).fillColor(GRAY).text(label, 50, rsY + 46);
      footer(2);

      // ══════════════════════════════════════════════════════════════════
      // PAGES 3–5 — PER-CONNECTOR BREAKDOWN
      // ══════════════════════════════════════════════════════════════════
      const connectorPages = connectors.length;
      void connectorPages; // retained for future page-count display
      for (let i = 0; i < 3; i++) {
        doc.addPage(); bg();
        const platform = connectors[i];

        if (!platform) {
          // Filler page when fewer than 3 connectors
          doc.fillColor(GRAY).font(FONT_BOLD).fontSize(14)
             .text('No Additional Connector Data', 50, H / 2 - 20, { align: 'center', width: W - 100 });
          footer(3 + i);
          continue;
        }

        doc.fillColor(INK).font(FONT_BOLD).fontSize(20).text(`Platform Breakdown: ${platform.toUpperCase()}`, 50, 80);
        hRule(110);

        const perPlatformCount = Math.round((audit.mentions_count ?? 0) / Math.max(connectors.length, 1));

        doc.font(FONT_MONO).fontSize(8).fillColor(GRAY)
           .text(`Indexing window: 24 months | Records analysed: ~${perPlatformCount}`, 50, 120);

        doc.fillColor(INK).font(FONT_BOLD).fontSize(11).text('Top Mentioned Entities', 50, 155);
        doc.font(FONT_BODY).fontSize(10)
           .text(topEntities.slice(0, 5).join(' · ') || 'None detected', 50, 172, { width: W - 100 });

        doc.font(FONT_BOLD).fontSize(11).text('Sentiment Distribution', 50, 210);
        const sb = meta.sentimentBalance ?? 1;
        const pos = Math.round(sb * 100);
        const neg = Math.round((1 - sb) * 100);
        doc.font(FONT_MONO).fontSize(9)
           .text(`Positive: ${pos}%  |  Negative: ${neg}%  |  Neutral: ${100 - pos - neg < 0 ? 0 : 100 - pos - neg}%`, 50, 227);

        doc.font(FONT_BOLD).fontSize(11).text('Significant Records', 50, 265);

        // Show real memories if available, fall back to commitments
        const realMems = platformMemories[platform] ?? [];
        const platformCommitments = commitments.filter(c => c.platform === platform);

        if (realMems.length > 0) {
          // Real memory records from Supabase
          realMems.slice(0, 3).forEach((mem, ci: number) => {
            const ry = 285 + ci * 95;
            doc.rect(50, ry, W - 100, 80).strokeColor(LIGHT).lineWidth(0.5).stroke();
            const snippet = (mem.content || mem.title || '').slice(0, 240);
            doc.font(FONT_BODY).fontSize(9).fillColor(INK)
               .text(`"${snippet}${snippet.length >= 240 ? '…' : ''}"`, 62, ry + 14, { width: W - 124 });
            doc.font(FONT_MONO).fontSize(7).fillColor(GRAY)
               .text(
                 `Source: ${platform.toUpperCase()} | ${mem.timestamp ? new Date(mem.timestamp).toLocaleDateString() : 'N/A'}`,
                 62, ry + 60
               );
          });
        } else if (platformCommitments.length > 0) {
          // Commitments fallback
          platformCommitments.slice(0, 3).forEach((c, ci: number) => {
            const ry = 285 + ci * 95;
            doc.rect(50, ry, W - 100, 80).strokeColor(LIGHT).lineWidth(0.5).stroke();
            doc.font(FONT_BODY).fontSize(9).fillColor(INK)
               .text(`"${(c.text ?? '').slice(0, 220)}…"`, 62, ry + 14, { width: W - 124 });
            doc.font(FONT_MONO).fontSize(7).fillColor(GRAY)
               .text(`Source: ${(c.platform ?? platform).toUpperCase()} | ${c.date ? new Date(c.date).toLocaleDateString() : 'N/A'} | CID: ${(c.citation ?? '').slice(0, 8)}`, 62, ry + 60);
          });
        } else {
          doc.font(FONT_BODY).fontSize(10).fillColor(GRAY)
             .text('No specific records extracted for this connector.', 62, 290);
        }
        footer(3 + i);
      }

      // ══════════════════════════════════════════════════════════════════
      // PAGE 6 — COMMITMENTS & OPPORTUNITIES
      // ══════════════════════════════════════════════════════════════════
      doc.addPage(); bg();
      doc.fillColor(INK).font(FONT_BOLD).fontSize(20).text('Commitments & Opportunities', 50, 80);
      hRule(110);

      const mid = W / 2;

      // Left column — Commitments
      doc.fontSize(12).font(FONT_BOLD).fillColor(INK).text('Detected Commitments', 50, 130);
      if (commitments.length === 0) {
        doc.font(FONT_BODY).fontSize(10).fillColor(GRAY).text('No commitments detected.', 50, 155);
      } else {
        commitments.slice(0, 7).forEach((c, i: number) => {
          const cy = 155 + i * 55;
          doc.font(FONT_BODY).fontSize(9).fillColor(INK)
             .text(`${i + 1}. ${(c.text ?? '').slice(0, 100)}`, 50, cy, { width: mid - 70 });
          doc.font(FONT_MONO).fontSize(7).fillColor(GRAY)
             .text(`${c.platform ?? ''} | Status: ${(c.status ?? 'pending').toUpperCase()}`, 50, cy + 22);
        });
      }

      // Right column — Opportunities
      doc.fillColor(INK).font(FONT_BOLD).fontSize(12).text('Detected Opportunities', mid + 10, 130);
      if (opportunities.length === 0) {
        doc.font(FONT_BODY).fontSize(10).fillColor(GRAY).text('No opportunities detected.', mid + 10, 155);
      } else {
        opportunities.slice(0, 7).forEach((o: string, i: number) => {
          const oy = 155 + i * 55;
          doc.font(FONT_BODY).fontSize(9).fillColor(INK)
             .text(`${i + 1}. ${o.slice(0, 100)}`, mid + 10, oy, { width: mid - 70 });
          doc.font(FONT_MONO).fontSize(7).fillColor(GRAY)
             .text('Strategy focus: High Priority', mid + 10, oy + 22);
        });
      }
      footer(6);

      // ══════════════════════════════════════════════════════════════════
      // PAGE 7 — RISK FINDINGS
      // ══════════════════════════════════════════════════════════════════
      doc.addPage(); bg();
      doc.fillColor(INK).font(FONT_BOLD).fontSize(20).text('Risk Findings', 50, 80);
      hRule(110);

      if (riskFindings.length === 0) {
        doc.font(FONT_BODY).fontSize(11).fillColor(GRAY)
           .text('No significant risk findings were detected in this audit cycle.', 50, 140);
      } else {
        riskFindings.slice(0, 5).forEach((f, i: number) => {
          const ry = 130 + i * 112;
          doc.rect(50, ry, W - 100, 100).strokeColor(LIGHT).lineWidth(0.5).stroke();
          const accent = f.severity === 'High' ? RED : f.severity === 'Medium' ? AMBER : GREEN;
          doc.fillColor(accent).font(FONT_BOLD).fontSize(8)
             .text(f.severity?.toUpperCase() ?? 'MEDIUM', 65, ry + 14);
          doc.fillColor(INK).fontSize(12)
             .text(f.finding ?? 'Risk signal detected', 65, ry + 30, { width: W - 130 });
          doc.font(FONT_BODY).fontSize(9).fillColor(GRAY)
             .text(f.impact ?? 'Potential diligence concern.', 65, ry + 66, { width: W - 130 });
          doc.font(FONT_MONO).fontSize(7).fillColor(GRAY)
             .text(`Evidence: ${(f.evidence ?? 'N/A').slice(0, 80)}`, 65, ry + 82);
        });
      }
      footer(7);

      // ══════════════════════════════════════════════════════════════════
      // PAGE 8 — CITATIONS INDEX & LEGAL NOTICE
      // ══════════════════════════════════════════════════════════════════
      doc.addPage(); bg();
      doc.fillColor(INK).font(FONT_BOLD).fontSize(20).text('Citations Index', 50, 80);
      hRule(110);

      if (commitments.length === 0) {
        doc.font(FONT_BODY).fontSize(10).fillColor(GRAY).text('No citations to index.', 50, 130);
      } else {
        commitments.slice(0, 14).forEach((c, i: number) => {
          const cy = 125 + i * 32;
          doc.font(FONT_MONO).fontSize(8).fillColor(INK)
             .text(`${i + 1}. [${(c.platform ?? '').toUpperCase()}] ${c.date ? new Date(c.date).toLocaleDateString() : 'N/A'} — ID: ${(c.citation ?? '').slice(0, 8)}`, 50, cy);
          doc.font(FONT_BODY).fontSize(7).fillColor(GRAY)
             .text(`"${(c.text ?? '').slice(0, 130)}…"`, 50, cy + 12);
        });
      }

      // Legal Notice
      const legalY = H - 200;
      hRule(legalY, INK);
      doc.fillColor(INK).font(FONT_BOLD).fontSize(10).text('Legal Notice & Disclosures', 50, legalY + 18);
      doc.font(FONT_BODY).fontSize(8).lineGap(2).fillColor(INK)
         .text(
           'GDPR Compliance: All data processed under explicit subject authorisation. Stored encrypted at rest; never used for model training. ' +
           'Source Disclosure: Findings derived solely from connected neural links representing a point-in-time snapshot. ' +
           'EYES OS assumes no liability for decisions based on this automated synthesis. ' +
           'This report is generated on-demand and not stored on any server. The subject is solely responsible for document security after download.',
           50, legalY + 36, { width: W - 100 }
         );
      doc.fillColor(GRAY).font(FONT_BODY).fontSize(7)
         .text('EYES Neural Memory OS · Generated on-demand · Not stored', 50, H - 60);
      footer(8);

      doc.end();
    });

    const pdfBuffer = Buffer.concat(chunks);

    return new Response(pdfBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="eyes-audit-${audit.id.slice(0, 8).toUpperCase()}.pdf"`,
        'Content-Length': String(pdfBuffer.length),
        'Cache-Control': 'no-store',
      },
    });

  } catch (err) {
    console.error('[PDF On-Demand] Failed:', err);
    return NextResponse.json({ error: 'PDF generation failed.' }, { status: 500 });
  }
}
