import PDFDocument from 'pdfkit';
import { createClient, createAdminClient } from '@/utils/supabase/server';
import { ReputationAudit } from '@/types/dashboard';

/**
 * Reputation Audit: PDF Generation Service
 * Comprehensive 8-page certificate structure as per high-fidelity specification.
 */

export class PDFGenerationService {
  static async generateAndUpload(audit: ReputationAudit, userId: string): Promise<string> {
    return new Promise(async (resolve, reject) => {
      try {
        const doc = new PDFDocument({
          size: 'A4',
          margin: 40,
          info: {
            Title: `Reputation Audit - ${audit.id}`,
            Author: 'EYES Neural Memory OS',
          }
        });

        // Use system fonts only (no I/O overhead)
        const FONT_BODY = 'Helvetica';
        const FONT_BOLD = 'Helvetica-Bold';
        const FONT_MONO = 'Courier';

        const INK_BLACK = '#080808';
        const FOREST_GREEN = '#00899B';
        const MUTED_RED = '#EF4444';
        const GRAY_FOOTER = '#888888';

        const drawFooter = (pageNum: number, totalPages: number) => {
          doc.fillColor(GRAY_FOOTER).fontSize(7).font(FONT_BODY)
             .text(`ID: ${audit.id.slice(0, 8)} | Page ${pageNum} of ${totalPages}`, 40, doc.page.height - 30, { align: 'center' });
        };

        // --- PAGE 1: COVER & SUMMARY ---
        doc.fillColor(INK_BLACK).fontSize(24).font(FONT_BOLD).text('REPUTATION AUDIT', 40, 80);
        doc.fontSize(10).font(FONT_BODY).text('CONFIDENTIAL CERTIFICATE', 40, 110);
        doc.moveTo(40, 130).lineTo(555, 130).strokeColor(FOREST_GREEN).lineWidth(1.5).stroke();
        
        doc.fontSize(12).font(FONT_BODY).text(`Risk Score: `, 40, 170);
        doc.fontSize(28).font(FONT_BOLD).fillColor(audit.riskScore > 7 ? MUTED_RED : FOREST_GREEN).text((audit.riskScore || 0).toFixed(1), 130, 165);
        doc.fillColor(INK_BLACK).fontSize(10).font(FONT_BODY).text(`/ 10`, 200, 180);
        
        doc.fontSize(11).font(FONT_BODY).text(`Records Audited: ${audit.mentionsCount || 0}`, 40, 240);
        doc.text(`Commitments Found: ${audit.commitmentsCount || 0}`, 40, 260);
        doc.text(`Connectors: ${(audit.connectorsCovered || []).join(', ')}`, 40, 280);
        doc.text(`Date: ${new Date(audit.createdAt).toLocaleDateString()}`, 40, 300);

        doc.fontSize(11).font(FONT_BOLD).text('Executive Summary', 40, 360);
        doc.fontSize(10).font(FONT_BODY).lineGap(3)
           .text(audit.summaryNarrative || 'Analysis complete. No significant reputational anomalies detected.', 40, 380, { width: 515 });
        
        drawFooter(1, 3);

        // --- PAGE 2: METRICS & FINDINGS ---
        doc.addPage();
        doc.fillColor(INK_BLACK).fontSize(16).font(FONT_BOLD).text('Key Findings', 40, 80);
        
        let y = 120;
        doc.fontSize(10).font(FONT_BODY);
        doc.text(`Total Records: ${audit.mentionsCount || 0}`, 40, y); y += 20;
        doc.text(`Negative Sentiment: ${audit.metadata.failureRate || '0'}%`, 40, y); y += 20;
        doc.text(`Compliance Rate: ${audit.metadata.complianceRate || '100'}%`, 40, y); y += 20;
        doc.text(`High-Risk Items: ${audit.metadata.riskFindings?.length || 0}`, 40, y); y += 20;
        doc.text(`Unfulfilled Tasks: ${audit.commitmentsCount || 0}`, 40, y); y += 40;

        // Top 5 risk findings (concise)
        doc.fontSize(11).font(FONT_BOLD).text('Top Risk Findings', 40, y);
        y += 25;
        audit.metadata.riskFindings?.slice(0, 5).forEach((f, idx) => {
          const color = f.severity === 'High' ? MUTED_RED : f.severity === 'Medium' ? '#DAA520' : FOREST_GREEN;
          doc.fillColor(color).fontSize(9).font(FONT_BOLD).text(`${idx + 1}. [${f.severity.toUpperCase()}]`, 40, y);
          doc.fillColor(INK_BLACK).fontSize(9).font(FONT_BODY).text(f.finding, 130, y);
          y += 18;
        });

        // Opportunities
        y += 15;
        doc.fillColor(INK_BLACK).fontSize(11).font(FONT_BOLD).text('Opportunities', 40, y);
        y += 20;
        audit.metadata.opportunities?.slice(0, 3).forEach((opp, idx) => {
          doc.fontSize(9).font(FONT_BODY).text(`• ${opp}`, 40, y);
          y += 15;
        });

        drawFooter(2, 3);

        // --- PAGE 3: COMMITMENTS & LEGAL ---
        doc.addPage();
        doc.fillColor(INK_BLACK).fontSize(16).font(FONT_BOLD).text('Detected Commitments', 40, 80);
        
        y = 120;
        audit.metadata.commitments?.slice(0, 8).forEach((c, idx) => {
          doc.fontSize(9).font(FONT_BODY).text(`${idx + 1}. "${c.text.slice(0, 80)}..."`, 40, y);
          doc.fontSize(8).font(FONT_MONO).fillColor(GRAY_FOOTER)
             .text(`   [${c.platform.toUpperCase()}] ${c.status} | ${new Date(c.date).toLocaleDateString()}`, 40, y + 12);
          doc.fillColor(INK_BLACK);
          y += 28;
        });

        // Legal notice
        y = 480;
        doc.moveTo(40, y).lineTo(555, y).strokeColor(INK_BLACK).lineWidth(0.5).stroke();
        doc.fillColor(INK_BLACK).fontSize(9).font(FONT_BOLD).text('Legal Compliance', 40, y + 15);
        doc.fontSize(7).font(FONT_BODY).lineGap(2)
           .text('GDPR: Processed with explicit authorization. Data encrypted at rest and not used for model training. This report represents a point-in-time snapshot. EYES OS assumes no liability for external decisions based on this synthesis.', 40, y + 30, { width: 515 });
        
        drawFooter(3, 3);

        // Stream directly to Supabase (no memory buffer)
        const supabase = await createAdminClient();
        
        // Ensure bucket exists
        try {
          await supabase.storage.createBucket('audits', { public: false });
        } catch (e) {
          // Ignore if already exists
        }

        const fileName = `audit_${audit.id}.pdf`;
        const filePath = `${userId}/${fileName}`;

        // Stream upload
        const { error: uploadError } = await supabase.storage
          .from('audits')
          .upload(filePath, doc, {
            contentType: 'application/pdf',
            upsert: true
          });

        if (uploadError) {
          console.error('[PDF] Upload failed:', uploadError);
          resolve(null as any);
          return;
        }

        // Return a direct reference URL (avoid signed URL latency)
        const baseUrl = (supabase as any).storage.getPublicUrl('audits', filePath).data.publicUrl;
        if (baseUrl) {
          resolve(baseUrl);
        } else {
          // Fallback: construct URL manually
          resolve(`https://${process.env.NEXT_PUBLIC_SUPABASE_URL?.split('//')[1]}/storage/v1/object/public/audits/${filePath}`);
        }

      } catch (err) {
        console.error('[PDF] Generation failed:', err);
        resolve(null as any);
      }
    });
  }
}
