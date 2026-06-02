require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const readline = require('readline');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

async function run() {
  console.log("=== SLACK OAUTH BYPASS ===");
  
  // 1. Get User ID
  const { data: users, error: uErr } = await supabase.from('user_profiles').select('user_id').limit(1);
  if (uErr || !users.length) {
    console.error("Could not find your user ID in the database.");
    process.exit(1);
  }
  const userId = users[0].user_id;

  console.log("\nGo to https://api.slack.com/apps -> Select your App -> Click 'Install App' on the left menu.");
  console.log("Click the green 'Install to Workspace' button and click Allow.");
  console.log("Copy the 'User OAuth Token' (it starts with xoxp-...)");

  rl.question("\nPaste your xoxp- token here: ", async (token) => {
    if (!token.startsWith('xoxp-')) {
      console.error("Token must start with xoxp-");
      process.exit(1);
    }

    // 2. Insert into database
    console.log("\nInjecting token into your database...");
    const { error: tErr } = await supabase
      .from('oauth_tokens')
      .upsert({
        user_id: userId,
        platform: 'slack',
        access_token: token.trim(),
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id,platform' });

    if (tErr) {
      console.error("Failed to save token:", tErr);
    } else {
      console.log("✅ SUCCESS! Your real Slack data is now connected.");
      console.log("The background cron daemon will start pulling your messages within 30 minutes.");
    }
    
    // Also initialize sync status
    await supabase.from('sync_status').upsert({
        user_id: userId,
        platform: 'slack',
        status: 'idle',
        updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id,platform' });

    process.exit(0);
  });
}

run();
