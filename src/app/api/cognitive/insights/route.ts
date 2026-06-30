import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
        return NextResponse.json({ insight: null }, { status: 401 });
    }

    const { data, error } = await supabase
      .from('insights')
      .select('title, body')
      .eq('user_id', user.id)
      .eq('kind', 'narrative_identity')
      .is('is_current', true)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (error) {
        return NextResponse.json({ insight: null });
    }

    return NextResponse.json({ insight: data });
  } catch {
    return NextResponse.json({ insight: null });
  }
}
