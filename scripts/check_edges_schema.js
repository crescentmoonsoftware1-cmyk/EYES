const dotenv = require('dotenv');
dotenv.config({ path: './.env.local' });
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  try {
    // Run a query on information_schema or just fetch one row to see structure
    const { data, error } = await supabase.rpc('get_table_columns', { table_name: 'chronic_edges' });
    if (error) {
      console.log('RPC failed, trying raw select...');
      const { data: selectData, error: selectErr } = await supabase
        .from('chronic_edges')
        .select('*')
        .limit(1);
      if (selectErr) throw selectErr;
      console.log('Sample row:', selectData);
    } else {
      console.log('Columns:', data);
    }
  } catch (err) {
    console.error(err);
  }
}
run();
