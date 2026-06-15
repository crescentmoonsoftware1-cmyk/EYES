import dotenv from 'dotenv';
dotenv.config({ path: './.env.local' });

// Mock supabase cookies/auth
import { GET } from './src/app/api/audit/[id]/pdf/route';
import { createClient } from './src/utils/supabase/server';

async function run() {
  try {
    // Let's get the user ID first
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      console.error('Auth error or no user logged in. Please check Supabase session/env.', authError);
      return;
    }
    console.log('Using logged-in user:', user.email, 'ID:', user.id);

    // Get a completed audit ID for this user
    const { data: audits, error: auditError } = await supabase
      .from('reputation_audits')
      .select('id')
      .eq('user_id', user.id)
      .eq('status', 'completed')
      .limit(1);

    if (auditError || audits.length === 0) {
      console.error('No completed audits found for user in DB:', auditError);
      return;
    }
    const auditId = audits[0].id;
    console.log('Testing route with completed audit ID:', auditId);

    // Mock Next.js Request and params Promise
    const req = new Request(`http://localhost:3000/api/audit/${auditId}/pdf`);
    const params = Promise.resolve({ id: auditId });

    console.log('Calling GET route handler...');
    const response = await GET(req, { params });
    console.log('Route response status:', response.status);
    
    if (response.status !== 200) {
      const text = await response.text();
      console.log('Route error response:', text);
    } else {
      const blob = await response.blob();
      console.log('Success! PDF response size:', blob.size, 'bytes');
    }

  } catch (err) {
    console.error('Error running test_pdf_route:', err);
  }
}

run();
