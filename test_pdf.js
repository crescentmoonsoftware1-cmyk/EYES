const dotenv = require('dotenv');
dotenv.config({ path: './.env.local' });

// We need to support TypeScript loading or resolve imports.
// Since we are in next.js, we can write a simple ts script and run it with npx tsx!
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const userId = '4d2f3e3c-b834-43fc-852a-c3cdbb535b68';

async function run() {
  try {
    const { data: audits, error } = await supabase
      .from('reputation_audits')
      .select('*')
      .eq('user_id', userId)
      .eq('status', 'completed')
      .limit(1);

    if (error) throw error;
    if (audits.length === 0) {
      console.log('No completed audits found for this user.');
      return;
    }
    const audit = audits[0];
    console.log('Found audit:', audit.id);

    // Let's run a TS script via npx tsx to execute the pdf-generator code
    const fs = require('fs');
    fs.writeFileSync('temp_audit_data.json', JSON.stringify({ audit, userId }));

  } catch (err) {
    console.error('Error:', err);
  }
}
run();
