const dotenv = require('dotenv');
dotenv.config({ path: './.env.local' });

const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  try {
    const { data, error } = await supabase
      .from('user_profiles')
      .select('*')
      .limit(1);

    if (error) {
      console.error('Error fetching from user_profiles:', error);
    } else {
      console.log('Successfully fetched from user_profiles. Row:', data[0]);
    }
  } catch (err) {
    console.error(err);
  }
}
run();
