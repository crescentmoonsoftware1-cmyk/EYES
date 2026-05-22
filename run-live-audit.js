require('dotenv').config({ path: '.env.local' });
const { AuditAnalysisService } = require('./src/services/audit/analysis-pipeline');
const { createAdminClient } = require('./src/utils/supabase/server');

// We need to bypass the Next.js runtime environment for this local test
// so we'll mock the necessary bits if needed, but since we're calling the Service directly,
// and I've already updated it to use the Admin client, it should just work.

async function runLiveAudit() {
  const userId = '043eff80-871a-4b89-a3fa-b65dbe8717bb'; // The user with 3000+ memories
  console.log(`\n🚀 Starting live audit for user: ${userId}`);
  
  const supabase = await createAdminClient();
  
  // 1. Create a placeholder audit record
  const { data: audit, error: createError } = await supabase
    .from('reputation_audits')
    .insert({
      user_id: userId,
      status: 'analysis',
      risk_score: 0,
      mentions_count: 0,
      commitments_count: 0
    })
    .select()
    .single();

  if (createError) {
    console.error('❌ Failed to create audit record:', createError.message);
    return;
  }

  console.log(`✅ Audit record created: ${audit.id}`);
  console.log(`🧠 Running AI Analysis (using free models)...`);

  try {
    const result = await AuditAnalysisService.runAnalysis(audit.id, userId);
    console.log('\nAudit Analysis Result:', JSON.stringify(result, null, 2));

    // 2. Verify the result in DB
    const { data: finalized, error: fetchError } = await supabase
      .from('reputation_audits')
      .select('*')
      .eq('id', audit.id)
      .single();

    if (finalized) {
      console.log('\n=== FINALIZED AUDIT DATA ===');
      console.log(`Status:     ${finalized.status}`);
      console.log(`Risk Score: ${finalized.risk_score}`);
      console.log(`Mentions:   ${finalized.mentions_count}`);
      console.log(`Narrative:  ${finalized.summary_narrative?.slice(0, 200)}...`);
      console.log('============================\n');
    }
  } catch (err) {
    console.error('❌ Audit Analysis failed:', err);
  }
}

runLiveAudit();
