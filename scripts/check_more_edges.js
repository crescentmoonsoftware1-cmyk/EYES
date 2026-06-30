const dotenv = require('dotenv');
dotenv.config({ path: './.env.local' });
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  try {
    const { data, error } = await supabase
      .from('chronic_edges')
      .select('id, head_node_id, tail_node_id, relation_label, created_at')
      .limit(20);
    if (error) throw error;
    console.log('Edges found:', data.length);
    console.log('Sample rows:', data);
  } catch (err) {
    console.error(err);
  }
}
run();
