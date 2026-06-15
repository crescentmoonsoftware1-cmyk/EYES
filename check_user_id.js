const dotenv = require('dotenv');
dotenv.config({ path: './.env.local' });

const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  try {
    // List users from auth
    const { data: { users }, error } = await supabase.auth.admin.listUsers();
    if (error) throw error;
    
    const targetUser = users.find(u => u.email === 'thomasshelby251890@gmail.com');
    if (targetUser) {
      console.log('User found:', targetUser.email, 'ID:', targetUser.id);
    } else {
      console.log('User not found in auth.');
    }
  } catch (err) {
    console.error(err);
  }
}
run();
