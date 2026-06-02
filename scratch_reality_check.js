require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function checkReality() {
  console.log("=== CHECKING REALITY: ACTUAL DATABASE STATE ===");

  // 1. Check Connected Platforms
  const { data: connectors, error: cErr } = await supabase
    .from('connector_settings')
    .select('platform, is_active, status');
  
  if (cErr) console.error("Error fetching connectors:", cErr);
  else {
    console.log("\n[1] PLATFORMS CONNECTED IN DB:");
    connectors.forEach(c => console.log(`  - ${c.platform}: Active=${c.is_active}, Status=${c.status}`));
    if (connectors.length === 0) console.log("  (No connectors found in DB)");
  }

  // 2. Check Indexed Data
  const { data: memories, error: mErr } = await supabase
    .from('memories')
    .select('platform')
    // Get unique count manually if needed, or just fetch all and group
  if (mErr) console.error("Error fetching memories:", mErr);
  else {
    const counts = {};
    memories.forEach(m => counts[m.platform] = (counts[m.platform] || 0) + 1);
    console.log("\n[2] ACTUAL DATA INDEXED (Records per platform):");
    Object.entries(counts).forEach(([platform, count]) => {
      console.log(`  - ${platform}: ${count} records`);
    });
    if (memories.length === 0) console.log("  (No memories found in DB)");
  }

  // 3. Check Sync Logs for Failures
  const { data: logs, error: lErr } = await supabase
    .from('sync_run_logs')
    .select('platform, status, error_message, created_at')
    .order('created_at', { ascending: false })
    .limit(10);
    
  if (lErr) console.error("Error fetching logs:", lErr);
  else {
    console.log("\n[3] RECENT SYNC STATUS (Last 10 attempts):");
    logs.forEach(l => console.log(`  - ${l.platform}: ${l.status} | ${l.error_message || 'OK'}`));
  }
}

checkReality();
