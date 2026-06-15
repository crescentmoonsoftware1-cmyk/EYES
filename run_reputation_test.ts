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

    // Insert a new audit record for the Reputation Lens
    console.log('[Test Runner] Inserting new reputation audit record...');
    const { data: newAudit, error: insertError } = await supabase
      .from('reputation_audits')
      .insert({
        user_id: user.id,
        status: 'pending',
        risk_score: 0.0,
        mentions_count: 0,
        commitments_count: 0,
        metadata: { audit_type: 'reputation' }
      })
      .select()
      .single();

    if (insertError) throw insertError;
    console.log(`[Test Runner] Created audit record with ID: ${newAudit.id}`);

    console.log(`[Test Runner] Running analysis pipeline for audit ID: ${newAudit.id}...`);
    
    // Execute the analysis pipeline for the reputation lens
    await AuditAnalysisService.runAnalysis(newAudit.id, user.id);
    console.log('[Test Runner] Pipeline execution complete! Fetching updated audit record...');

    // Fetch updated audit record
    const { data: updatedAudits, error: fetchErr } = await supabase
      .from('reputation_audits')
      .select('*')
      .eq('id', newAudit.id)
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
    
    const outputPath = path.join('img', 'eyes-reputation-latest.pdf');
    fs.writeFileSync(outputPath, buffer);
    console.log(`[Test Runner] PDF successfully saved to: ${outputPath} (${buffer.length} bytes)`);

  } catch (err) {
    console.error('[Test Runner] Execution failed:', err);
  }
}

run();
