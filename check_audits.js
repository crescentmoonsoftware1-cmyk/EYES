const dotenv = require('dotenv');
dotenv.config({ path: './.env.local' });

const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  try {
    const { data: audits, error } = await supabase
      .from('reputation_audits')
      .select('id, user_id, status, risk_score, created_at')
      .eq('user_id', '4d2f3e3c-b834-43fc-852a-c3cdbb535b68');

    if (error) throw error;
    console.log(`Found ${audits.length} audits:`);
    console.log(audits);
  } catch (err) {
    console.error(err);
  }
}
run();
