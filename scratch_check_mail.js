require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing Supabase credentials in .env.local");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkMail() {
  const today = new Date();
  today.setHours(0, 0, 0, 0); // Start of today

  const { data, error } = await supabase
    .from('memories')
    .select('title, timestamp, embedding')
    .eq('platform', 'gmail')
    .gte('timestamp', today.toISOString())
    .order('timestamp', { ascending: false })
    .limit(5);

  if (error) {
    console.error("Error fetching mail:", error);
    return;
  }

  if (data.length === 0) {
    console.log("No mail found for today in the database.");
  } else {
    console.log(`Found ${data.length} recent emails from today:`);
    data.forEach(mail => {
      console.log(`- [${new Date(mail.timestamp).toLocaleString()}] ${mail.title} | Embedded: ${mail.embedding ? 'Yes' : 'No'}`);
    });
  }
}

checkMail();
