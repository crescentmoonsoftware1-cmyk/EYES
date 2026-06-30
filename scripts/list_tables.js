const dotenv = require('dotenv');
dotenv.config({ path: './.env.local' });
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  try {
    const { data, error } = await supabase.rpc('get_tables');
    if (error) {
      console.log('RPC failed, fetching table list via information_schema query if possible...');
      // Since direct SQL execution isn't possible via PostgREST without an RPC, let's just query a known table or run a RPC if exists.
      // If we don't have a get_tables RPC, let's try to query public schema via RPC if any general sql runner exists.
      console.log(error);
    } else {
      console.log('Tables:', data);
    }
  } catch (err) {
    console.error(err);
  }
}
run();
