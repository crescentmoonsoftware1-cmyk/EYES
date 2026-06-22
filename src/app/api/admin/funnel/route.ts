import { NextRequest, NextResponse } from 'next/server';
import { createClient, createAdminClient } from '@/utils/supabase/server';

export async function GET(req: NextRequest) {
  try {
    // 1. Authenticate user
    const client = await createClient();
    const { data: { user }, error: authError } = await client.auth.getUser();

    if (authError || !user || !user.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // 2. Validate admin authorization
    const adminEmailsEnv = process.env.ADMIN_EMAILS || '';
    const adminEmails = adminEmailsEnv.split(',').map(email => email.trim().toLowerCase());

    if (!adminEmails.includes(user.email.toLowerCase())) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // 3. Parse cohort period filter
    const { searchParams } = new URL(req.url);
    const period = searchParams.get('period') || 'all';

    const adminClient = await createAdminClient();

    // Fetch cohort profiles based on date range
    let profilesQuery = adminClient
      .from('user_profiles')
      .select('user_id, created_at');

    if (period === '24h') {
      profilesQuery = profilesQuery.gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());
    } else if (period === '7d') {
      profilesQuery = profilesQuery.gte('created_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString());
    } else if (period === '30d') {
      profilesQuery = profilesQuery.gte('created_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString());
    }

    const { data: profiles, error: profilesError } = await profilesQuery;
    if (profilesError) throw profilesError;

    const totalSignups = profiles?.length || 0;
    const cohortUserIds = (profiles || []).map(p => p.user_id);

    // If cohort is empty, return zeroed metrics
    if (totalSignups === 0) {
      return NextResponse.json({
        success: true,
        data: {
          totalSignups: 0,
          totalConnected: 0,
          totalCompletedAudits: 0,
          stuckBeforeConnecting: 0,
          connectedButNeverAudited: 0,
          platformBreakdown: {},
          recentActivity: []
        }
      });
    }

    // Query tokens in cohort
    let tokensQuery = adminClient.from('oauth_tokens').select('platform, user_id').limit(10000);
    if (period !== 'all') {
      tokensQuery = tokensQuery.in('user_id', cohortUserIds);
    }
    const { data: tokensData, error: tokensError } = await tokensQuery;
    if (tokensError) throw tokensError;

    const connectedUserIds = Array.from(new Set((tokensData || []).map(row => row.user_id)));
    const totalConnected = connectedUserIds.length;

    // Platform breakdown calculations
    const platformBreakdown: Record<string, number> = {};
    (tokensData || []).forEach(row => {
      const pName = row.platform || 'unknown';
      platformBreakdown[pName] = (platformBreakdown[pName] || 0) + 1;
    });

    // Query completed audits in cohort
    let auditsQuery = adminClient.from('reputation_audits').select('user_id').eq('status', 'completed');
    if (period !== 'all') {
      auditsQuery = auditsQuery.in('user_id', cohortUserIds);
    }
    const { data: auditsData, error: auditsError } = await auditsQuery;
    if (auditsError) throw auditsError;

    const auditedUserIds = Array.from(new Set((auditsData || []).map(row => row.user_id)));
    const totalCompletedAudits = auditedUserIds.length;

    // Calculations
    const stuckBeforeConnecting = Math.max(0, totalSignups - totalConnected);
    const connectedButNeverAudited = Math.max(0, totalConnected - auditedUserIds.filter(id => connectedUserIds.includes(id)).length);

    // Fetch recent activities in cohort
    let recentProfilesQuery = adminClient
      .from('user_profiles')
      .select('user_id, created_at')
      .order('created_at', { ascending: false })
      .limit(5);
    
    let recentAuditsQuery = adminClient
      .from('reputation_audits')
      .select('user_id, status, created_at')
      .order('created_at', { ascending: false })
      .limit(5);

    if (period !== 'all') {
      recentProfilesQuery = recentProfilesQuery.in('user_id', cohortUserIds);
      recentAuditsQuery = recentAuditsQuery.in('user_id', cohortUserIds);
    }

    const [recentProfilesRes, recentAuditsRes] = await Promise.all([
      recentProfilesQuery,
      recentAuditsQuery
    ]);

    const activityList: Array<{ type: string; userId: string; timestamp: string; status?: string }> = [];

    (recentProfilesRes.data || []).forEach(p => {
      activityList.push({
        type: 'signup',
        userId: p.user_id,
        timestamp: p.created_at
      });
    });

    (recentAuditsRes.data || []).forEach(a => {
      activityList.push({
        type: 'audit',
        userId: a.user_id,
        timestamp: a.created_at,
        status: a.status
      });
    });

    // Sort by timestamp desc, limit to top 8 entries
    const recentActivity = activityList
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, 8);

    return NextResponse.json({
      success: true,
      data: {
        totalSignups,
        totalConnected,
        totalCompletedAudits,
        stuckBeforeConnecting,
        connectedButNeverAudited,
        platformBreakdown,
        recentActivity
      }
    });

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('[Admin Funnel API Error]:', error);
    return NextResponse.json({ error: errorMessage || 'Internal Server Error' }, { status: 500 });
  }
}
