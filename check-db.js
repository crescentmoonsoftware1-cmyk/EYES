require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function checkData() {
  console.log('\n=== EYES Database Status ===\n');
  
  const { count: memoryCount, error: memError } = await supabase
    .from('memories')
    .select('*', { count: 'exact', head: true });

  const { data: users, error: userError } = await supabase
    .from('user_profiles')
    .select('id, full_name, email')
    .limit(5);

  if (memError) console.error('Error fetching memories:', memError.message);
  else console.log(`Memories count: ${memoryCount}`);

  if (userError) console.error('Error fetching users:', userError.message);
  else {
    console.log(`\nFound ${users.length} users:`);
    users.forEach(u => console.log(`- ${u.full_name || 'No Name'} (${u.email || 'No Email'}) [${u.id}]`));
  }
  
  console.log('\n===========================\n');
}

checkData();
