import { NextResponse } from 'next/server';
import { resolveSyncActor } from '@/utils/sync/actor';
import { upsertRawEventsSafely, upsertSyncStatusSafely } from '@/utils/supabase/upsert';
import { decryptToken } from '@/services/auth/tokens';

type SentryOrg = { slug: string; name: string };
type SentryIssue = {
  id: string; title: string; culprit?: string; level?: string;
  status?: string; lastSeen?: string; firstSeen?: string; count?: string;
  permalink?: string; project?: { slug?: string; name?: string };
  metadata?: { value?: string; type?: string };
};

export async function POST(request: Request) {
  const actor = await resolveSyncActor(request);
  if ('status' in actor) return NextResponse.json({ error: actor.error }, { status: actor.status });
  const { supabase, userId } = actor;
  try {
    const { data: tokenRow } = await supabase
      .from('oauth_tokens').select('access_token')
      .eq('user_id', userId).eq('platform', 'sentry').maybeSingle();
    if (!tokenRow?.access_token) return NextResponse.json({ error: 'Sentry is not connected.' }, { status: 401 });

    const { data: currentStatus } = await supabase
      .from('sync_status').select('total_items')
      .eq('user_id', userId).eq('platform', 'sentry').maybeSingle();

    await upsertSyncStatusSafely(supabase, { user_id: userId, platform: 'sentry', status: 'syncing', last_sync_at: new Date().toISOString() });

    const accessToken = decryptToken(tokenRow.access_token) || '';
    const headers = { Authorization: `Bearer ${accessToken}` };
    const url = new URL(request.url);
    const limit = url.searchParams.get('depth') === 'deep' ? 100 : 25;

    // Step 1: Get orgs the user belongs to
    const orgsResp = await fetch('https://sentry.io/api/0/organizations/', { headers, cache: 'no-store' });
    if (!orgsResp.ok) throw new Error(`Sentry organizations API (${orgsResp.status})`);
    const orgs = (await orgsResp.json()) as SentryOrg[];

    const events: Record<string, unknown>[] = [];

    for (const org of orgs.slice(0, 5)) {
      // Step 2: Fetch issues for each org
      const issuesResp = await fetch(
        `https://sentry.io/api/0/organizations/${org.slug}/issues/?limit=${limit}&query=is:unresolved&sort=date`,
        { headers, cache: 'no-store' }
      );
      if (!issuesResp.ok) continue;
      const issues = (await issuesResp.json()) as SentryIssue[];

      for (const issue of issues) {
        const isFatal = issue.level === 'fatal';
        const isError = issue.level === 'error';
        const flagged = isFatal || isError;
        events.push({
          user_id: userId, platform: 'sentry',
          platform_id: `issue_${issue.id}`,
          event_type: 'issue',
          title: `[${issue.level?.toUpperCase() ?? 'ISSUE'}] ${issue.title}`,
          content: [
            issue.title,
            issue.culprit ? `In: ${issue.culprit}` : '',
            issue.metadata?.value ? `Error: ${issue.metadata.value}` : '',
            `Project: ${issue.project?.name ?? org.name}`,
            `Occurrences: ${issue.count ?? 0}`,
          ].filter(Boolean).join(' | '),
          author: 'Sentry',
          timestamp: issue.lastSeen || issue.firstSeen || new Date().toISOString(),
          is_flagged: flagged,
          flag_severity: isFatal ? 'DIRECT' : isError ? 'HIGH' : 'MEDIUM',
          flag_reason: isFatal ? 'Fatal production error' : isError ? 'Production error detected' : 'Warning detected',
          metadata: {
            issue_id: issue.id, org: org.slug,
            project: issue.project?.slug, level: issue.level,
            status: issue.status, permalink: issue.permalink,
            count: issue.count, first_seen: issue.firstSeen,
          },
        });
      }
    }

    if (events.length > 0) await upsertRawEventsSafely(supabase, events);

    const { count: totalMemories } = await supabase
      .from('memories').select('id', { count: 'exact', head: true }).eq('user_id', userId);
    const now = new Date().toISOString();
    await Promise.all([
      upsertSyncStatusSafely(supabase, {
        user_id: userId, platform: 'sentry', status: 'connected',
        sync_progress: 100, total_items: (currentStatus?.total_items ?? 0) + events.length,
        last_sync_at: now, next_sync_at: new Date(Date.now() + 3600000).toISOString(), error_message: null,
      }),
      supabase.from('user_profiles').update({ memories_indexed: totalMemories ?? events.length, updated_at: now }).eq('user_id', userId),
    ]);

    return NextResponse.json({ success: true, orgs: orgs.length, count: events.length });
  } catch (err) {
    console.error('[Sentry Sync] Error:', err);
    await upsertSyncStatusSafely(supabase, { user_id: userId, platform: 'sentry', status: 'error', error_message: String(err).slice(0, 200) });
    return NextResponse.json({ error: 'Sentry sync failed' }, { status: 500 });
  }
}
