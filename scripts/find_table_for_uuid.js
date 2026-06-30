const dotenv = require('dotenv');
dotenv.config({ path: './.env.local' });
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const tables = [
  'memories',
  'cognitive_clusters',
  'detected_loops',
  'drift_snapshots',
  'state_vectors',
  'entity_correlations',
  'entities',
  'alerts'
];

async function run() {
  const uuid = '0104f3ad-7a0e-4eea-b295-6146e0b313db';
  for (const table of tables) {
    try {
      const { data, error } = await supabase
        .from(table)
        .select('*')
        .eq('id', uuid);
      if (error) {
        // Try other columns if id is not the primary key, or just ignore error
        continue;
      }
      if (data && data.length > 0) {
        console.log(`Found in table ${table}:`, data);
        return;
      }
    } catch (e) {
      // ignore
    }
  }
  console.log('UUID not found in any of the primary ID fields.');
}
run();
