const { createAdminClient } = require('./src/utils/supabase/server');

async function test() {
  try {
    const supabase = await createAdminClient();
    
    // Fetch latest audit for user 0a076138-76dd-43c7-8da6-c7183b8754aa
    const { data: audit, error } = await supabase
      .from('reputation_audits')
      .select('*')
      .eq('user_id', '0a076138-76dd-43c7-8da6-c7183b8754aa')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
      
    if (error) {
      console.error('Error:', error);
      return;
    }
    
    console.log('Database Row ID:', audit.id);
    console.log('Database Row Type of ID:', typeof audit.id);
  } catch (err) {
    console.error('Failed:', err);
  }
}

test();
