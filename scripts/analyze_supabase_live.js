const dotenv = require('dotenv');
dotenv.config({ path: './.env.local' });

async function analyzeSupabaseDirectly() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceKey) {
    console.error("Missing Supabase credentials in .env.local");
    return;
  }

  try {
    // Fetch the OpenAPI schema directly from the Supabase REST API
    const response = await fetch(`${supabaseUrl}/rest/v1/?apikey=${serviceKey}`);
    const data = await response.json();
    
    console.log("=== SUPABASE LIVE DATABASE ANALYSIS ===");
    console.log("Tables found inside Supabase:");
    
    // The definitions object contains all the tables and their columns
    const tables = data.definitions;
    for (const [tableName, tableDetails] of Object.entries(tables)) {
      console.log(`\nTable: [${tableName}]`);
      const columns = tableDetails.properties;
      for (const [colName, colDetails] of Object.entries(columns)) {
        console.log(`  - ${colName} (${colDetails.type || colDetails.format})`);
      }
    }
  } catch (err) {
    console.error("Error analyzing Supabase:", err);
  }
}

analyzeSupabaseDirectly();
