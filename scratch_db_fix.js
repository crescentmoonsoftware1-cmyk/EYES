require('dotenv').config({ path: '.env.local' });

async function runSQL() {
  const token = process.env.SUPABASE_ACCESS_TOKEN;
  const projectRef = 'rwywnbkvbztzosvbmrqw';
  
  if (!token) {
    console.error("Missing SUPABASE_ACCESS_TOKEN");
    return;
  }

  const query = `
    ALTER TABLE cron_execution_log ADD COLUMN IF NOT EXISTS dead_letter_count_24h INT DEFAULT 0;
    NOTIFY pgrst, reload schema;
  `;

  console.log("Executing SQL...");
  const res = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/query`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ query })
  });

  if (!res.ok) {
    const err = await res.text();
    console.error("Failed to run SQL:", res.status, err);
  } else {
    console.log("Success! Column added and schema reloaded.");
  }
}

runSQL();
