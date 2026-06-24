import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import { resolve } from 'path';

dotenv.config({ path: resolve(process.cwd(), '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing SUPABASE environment variables.");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function createTestUser() {
  console.log("🛠️ Creating test user...");
  const { data, error } = await supabase.auth.admin.createUser({
    email: 'testuser@example.com',
    password: 'password123',
    email_confirm: true
  });

  if (error) {
    if (error.message.includes('User already registered')) {
        console.log("User already exists, that's fine.");
    } else {
        console.error("Error creating test user:", error.message);
    }
  } else {
      console.log("✅ Test user created: testuser@example.com / password123");
  }

  // Ensure user profile exists
  if (data?.user) {
    const { error: profileError } = await supabase.from('user_profiles').insert({
        user_id: data.user.id,
        email: data.user.email
    }).select().single();
    if (profileError && profileError.code !== '23505') { // Ignore unique constraint violation
        console.error("Failed to create profile:", profileError.message);
    }
  }
}

createTestUser();
