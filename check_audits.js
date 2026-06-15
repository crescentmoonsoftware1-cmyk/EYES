const dotenv = require('dotenv');
dotenv.config({ path: './.env.local' });

const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  try {
    const { data: audits, error } = await supabase
      .from('reputation_audits')
      .select('id, user_id, status, stage, risk_score, created_at, error_message')
      .eq('user_id', 'cc860f68-fa04-4fbf-9716-6fda32df4c3b');

    if (error) throw error;
    console.log(`Found ${audits.length} audits:`);
    console.log(audits);
  } catch (err) {
    console.error(err);
  }
}
run();
