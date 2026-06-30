const dotenv = require('dotenv');
dotenv.config({ path: './.env.local' });

const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  try {
    const { data: audit, error } = await supabase
      .from('reputation_audits')
      .select('id, user_id, status, risk_score, created_at')
      .eq('id', 'dd1fe08c-e7b4-46ba-a1b2-da6517cfc89b')
      .maybeSingle();

    if (error) throw error;
    console.log('Audit record:', audit);
  } catch (err) {
    console.error(err);
  }
}
run();
