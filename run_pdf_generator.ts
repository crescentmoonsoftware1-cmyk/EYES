import dotenv from 'dotenv';
dotenv.config({ path: './.env.local' });

import fs from 'fs';
import { PDFGenerationService } from './src/services/audit/pdf-generator';
import { ReputationAudit } from './src/types/dashboard';

async function run() {
  try {
    const raw = fs.readFileSync('temp_audit_data.json', 'utf8');
    const { audit, userId } = JSON.parse(raw);

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

    console.log('Generating PDF buffer...');
    const buffer = await PDFGenerationService.generateBuffer(mappedAudit, userId);
    console.log('PDF generated successfully!', buffer.length, 'bytes');

  } catch (err) {
    console.error('Error generating PDF:', err);
  } finally {
    try {
      fs.unlinkSync('temp_audit_data.json');
    } catch {}
  }
}

run();
