import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  const userId = '4d2f3e3c-b834-43fc-852a-c3cdbb535b68'; // Extracted from logs

  // Next 11 AM
  const now = new Date();
  const meetingDate = new Date();
  meetingDate.setHours(11, 0, 0, 0);
  if (meetingDate < now) {
    meetingDate.setDate(meetingDate.getDate() + 1);
  }

  const { data, error } = await supabase.from('action_queue').insert({
    user_id: userId,
    memory_id: null,
    platform: 'google_calendar',
    title: 'Test Meeting @ 11:00',
    description: 'A test meeting injected by Antigravity to verify calendar scheduling.',
    suggested_action: 'Schedule a meeting for 11:00',
    action_type: 'CALENDAR',
    method: 'POST',
    confidence: 99,
    status: 'pending',
    extracted_at: new Date().toISOString()
  });

  if (error) {
    console.error('Failed to inject:', error);
  } else {
    console.log('Successfully injected test meeting into Action Queue!');
  }
}

run();
