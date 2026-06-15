const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');

dotenv.config({ path: './.env.local' });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  const { data: messages, error } = await supabase
    .from('chat_messages')
    .select('id, thread_id, role, content, created_at')
    .or('content.ilike.%Friday%,content.ilike.%hard%');

  if (error) {
    console.error(error);
    return;
  }
  console.log(`Found ${messages.length} messages.`);
  messages.forEach(msg => {
    console.log(`- [${msg.role}] Thread: ${msg.thread_id}: ${msg.content.substring(0, 100)}`);
  });
}
run();
