import dotenv from 'dotenv';
dotenv.config({ path: './.env.local' });

import { GET } from './src/app/api/audit/[id]/pdf/route';
import { createClient } from '@supabase/supabase-js';

// We will use the client SDK with the service role key to sign in or get user session.
// Wait, we can't sign in with service role directly, but we can generate a signed session/token for the user, 
// or simply sign in as the user using their email and password!
// Wait! Let's check: what is the password of thomasshelby251890@gmail.com?
// Since we don't know the password, can we generate an auth token for this user using Supabase Admin API?
// Yes! Supabase admin API allows creating a link or signing in as a user, or we can just mock the whole 
// `cookies()` return value or stub `supabase.auth.getUser()` inside our test!

async function run() {
  try {
    // Let's get a completed audit ID first
    const serviceSupabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const userId = '4d2f3e3c-b834-43fc-852a-c3cdbb535b68';

    const { data: audits, error: auditError } = await serviceSupabase
      .from('reputation_audits')
      .select('id')
      .eq('user_id', userId)
      .eq('status', 'completed')
      .limit(1);

    if (auditError || audits.length === 0) {
      console.error('No completed audits found for user:', auditError);
      return;
    }
    const auditId = audits[0].id;
    console.log('Found completed audit ID:', auditId);

    // Let's mock createClient to return a client where auth.getUser returns our user!
    const mockUser = {
      id: userId,
      email: 'thomasshelby251890@gmail.com',
      user_metadata: { name: 'Tommy' }
    };

    // We can stub the import or mock the module in vitest. 
    // Since we are running in a standalone tsx script, we can temporarily monkey-patch the import or mock `@/utils/supabase/server`!
    // Wait, since Route Handler uses:
    // `const supabase = await createClient();`
    // We can override/monkey-patch the cookies or next/headers module!
    // But even simpler: let's write a temporary vitest file and run vitest on it!
    // Vitest has `vi.mock` which allows us to mock `@/utils/supabase/server` easily.

  } catch (err) {
    console.error('Error:', err);
  }
}
run();
