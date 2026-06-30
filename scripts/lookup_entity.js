const dotenv = require('dotenv');
dotenv.config({ path: './.env.local' });
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  try {
    const sampleUuid = '0104f3ad-7a0e-4eea-b295-6146e0b313db';
    const { data, error } = await supabase
      .from('entities')
      .select('*')
      .eq('id', sampleUuid);
    if (error) throw error;
    console.log('Entity found:', data);
  } catch (err) {
    console.error(err);
  }
}
run();
