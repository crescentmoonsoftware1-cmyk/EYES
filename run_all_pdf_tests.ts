import dotenv from 'dotenv';
dotenv.config({ path: './.env.local' });

import { createClient } from '@supabase/supabase-js';
import { PDFGenerationService } from './src/services/audit/pdf-generator';
import { ReputationAudit } from './src/types/dashboard';

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function run() {
  try {
    const { data: audits, error } = await supabase
      .from('reputation_audits')
      .select('*')
      .eq('status', 'completed');

    if (error) throw error;
    console.log(`Found ${audits.length} completed audits. Testing all...`);

    for (const audit of audits) {
      console.log(`Testing audit: ${audit.id} (user: ${audit.user_id})`);
      
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

      try {
        const buffer = await PDFGenerationService.generateBuffer(mappedAudit, audit.user_id);
        console.log(`  -> Success: ${buffer.length} bytes`);
      } catch (err) {
        console.error(`  -> FAILED on audit ${audit.id}:`, err);
      }
    }

  } catch (err) {
    console.error('Runner error:', err);
  }
}

run();
