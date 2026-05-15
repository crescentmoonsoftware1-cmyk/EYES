import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { createClient } from './src/utils/supabase/server';
import { AuditAnalysisService } from './src/services/audit/analysis-pipeline';

async function diagnose() {
  console.log('--- STARTING AUDIT DIAGNOSIS ---');
  const supabase = await createClient();
  
  // 1. Check if memories exist
  const { count: memoryCount } = await supabase
    .from('memories')
    .select('*', { count: 'exact', head: true });
    
  const { count: rawCount } = await supabase
    .from('raw_events')
    .select('*', { count: 'exact', head: true });

  console.log(`Memories (New Table): ${memoryCount}`);
  console.log(`Raw Events (Old Table): ${rawCount}`);

  // 2. Get the most recent audit
  const { data: audits, error: fetchError } = await supabase
    .from('reputation_audits')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(5);

  if (fetchError) {
    console.error('Error fetching audits:', fetchError);
    return;
  }

  if (!audits || audits.length === 0) {
    console.error('No audits found in reputation_audits table.');
    return;
  }

  console.log(`Found ${audits.length} recent audits.`);
  audits.forEach(a => console.log(` - ID: ${a.id}, Status: ${a.status}, Created: ${a.created_at}`));

  const audit = audits[0];
  console.log(`\nTesting Analysis for Audit: ${audit.id}...`);

  // 3. Trigger the analysis manually
  const result = await AuditAnalysisService.runAnalysis(audit.id, audit.user_id);
  console.log('\nFinal Diagnosis Result:', JSON.stringify(result, null, 2));
}

diagnose();
