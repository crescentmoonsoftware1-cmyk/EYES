import dotenv from 'dotenv';
dotenv.config({ path: './.env.local' });

import { createClient } from '@supabase/supabase-js';
import { AuditAnalysisService } from './src/services/audit/analysis-pipeline';
import { PDFGenerationService } from './src/services/audit/pdf-generator';
import { ReputationAudit } from './src/types/dashboard';
import fs from 'fs';
import path from 'path';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function run() {
  try {
    console.log('[Test Runner] Fetching target user (thomasshelby251890@gmail.com)...');
    const { data: { users }, error: userError } = await supabase.auth.admin.listUsers();
    if (userError) throw userError;

    const user = users.find(u => u.email === 'thomasshelby251890@gmail.com');
    if (!user) {
      throw new Error('Target user thomasshelby251890@gmail.com not found.');
    }
    console.log(`[Test Runner] User ID: ${user.id}`);

    // Fetch latest audit record
    const { data: audits, error: auditError } = await supabase
      .from('reputation_audits')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(1);

    if (auditError) throw auditError;
    if (!audits || audits.length === 0) {
      throw new Error('No audits found for user.');
    }

    const targetAudit = audits[0];
    console.log(`[Test Runner] Running analysis pipeline for audit ID: ${targetAudit.id}...`);
    
    // Execute the full analysis pipeline (triggers LLM and saves to DB)
    await AuditAnalysisService.runAnalysis(targetAudit.id, user.id);
    console.log('[Test Runner] Pipeline execution complete! Fetching updated audit record...');

    // Fetch updated audit record
    const { data: updatedAudits, error: fetchErr } = await supabase
      .from('reputation_audits')
      .select('*')
      .eq('id', targetAudit.id)
      .limit(1);
      
    if (fetchErr) throw fetchErr;
    const updatedAudit = updatedAudits[0];

    const mappedAudit: ReputationAudit = {
      id: updatedAudit.id,
      status: updatedAudit.status,
      riskScore: Number(updatedAudit.risk_score || 0),
      mentionsCount: updatedAudit.mentions_count || 0,
      commitmentsCount: updatedAudit.commitments_count || 0,
      summaryNarrative: updatedAudit.summary_narrative,
      connectorsCovered: updatedAudit.connectors_covered || [],
      reportUrl: updatedAudit.report_url,
      createdAt: updatedAudit.created_at,
      metadata: updatedAudit.metadata || {}
    };

    console.log('[Test Runner] Generating PDF buffer...');
    const buffer = await PDFGenerationService.generateBuffer(mappedAudit, user.id);
    
    const outputPath = path.join('img', 'eyes-audit-latest-test.pdf');
    fs.writeFileSync(outputPath, buffer);
    console.log(`[Test Runner] PDF successfully saved to: ${outputPath} (${buffer.length} bytes)`);

  } catch (err) {
    console.error('[Test Runner] Execution failed:', err);
  }
}

run();
