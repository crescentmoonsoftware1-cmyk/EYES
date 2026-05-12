import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const currentYear = new Date().getFullYear();
    const years = Array.from({ length: 9 }, (_, i) => currentYear - (8 - i));

    const statsPromises = years.map(async (year) => {
      const start = `${year}-01-01T00:00:00Z`;
      const end = `${year}-12-31T23:59:59Z`;

      const { count, error } = await supabase
        .from('memories')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .gte('timestamp', start)
        .lte('timestamp', end);

      if (error) throw error;
      return { year: year.toString(), count: count || 0 };
    });

    const timelineData = await Promise.all(statsPromises);

    return NextResponse.json({ timelineData });
  } catch (err) {
    console.error('Timeline stats error:', err);
    return NextResponse.json({ error: 'Failed to retrieve neural timeline' }, { status: 500 });
  }
}
