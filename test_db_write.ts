
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { createClient } from './src/utils/supabase/server';

async function testWrite() {
  console.log('--- TESTING DATABASE WRITE ---');
  const supabase = await createClient();
  
  const testMemory = {
    user_id: '4d2f3e3c-b834-43fc-852a-c3cdbb535b68', // From your logs
    platform: 'diagnostic_test',
    source_id: 'test_' + Date.now(),
    content: 'This is a test memory to diagnose database write failures.',
    timestamp: new Date().toISOString()
  };

  console.log('Attempting to insert test memory...');
  const { data, error } = await supabase
    .from('memories')
    .insert(testMemory)
    .select();

  if (error) {
    console.error('DATABASE WRITE FAILED!');
    console.error('Error Code:', error.code);
    console.error('Error Message:', error.message);
    console.error('Error Details:', error.details);
  } else {
    console.log('DATABASE WRITE SUCCESS!');
    console.log('Inserted Data:', JSON.stringify(data, null, 2));
    
    // Clean up
    await supabase.from('memories').delete().eq('platform', 'diagnostic_test');
  }
}

testWrite();
