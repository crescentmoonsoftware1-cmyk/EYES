const dotenv = require('dotenv');
dotenv.config({ path: './.env.local' });

const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  try {
    const { data: { users }, error } = await supabase.auth.admin.listUsers();
    if (error) throw error;
    
    users.forEach(u => {
      console.log('User:', u.email, 'ID:', u.id);
    });
  } catch (err) {
    console.error(err);
  }
}
run();
