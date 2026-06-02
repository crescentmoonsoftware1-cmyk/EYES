import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import { resolve } from 'path';

dotenv.config({ path: resolve(process.cwd(), '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkDB() {
  const { data: users } = await supabase.from('user_profiles').select('user_id').limit(1);
  if (!users || users.length === 0) {
    console.log("No users found.");
    return;
  }
  const userId = users[0].user_id;
  
  const { data: loops } = await supabase.from('detected_loops').select('*').eq('user_id', userId);
  const { data: clusters } = await supabase.from('cognitive_clusters').select('*').eq('user_id', userId);
  const { data: memories } = await supabase.from('memories').select('id').eq('user_id', userId);
  
  console.log(`--- DB STATUS FOR USER ${userId} ---`);
  console.log(`Total Memories: ${memories?.length || 0}`);
  console.log(`Detected Loops: ${loops?.length || 0}`);
  console.log(`Cognitive Clusters: ${clusters?.length || 0}`);
  if (loops?.length) console.log("Loops:", loops.map(l => l.loop_description));
  if (clusters?.length) console.log("Clusters:", clusters.map(c => c.cluster_label));
}

checkDB();
