import { NextResponse } from 'next/server';

import { upsertRawEventsSafely, upsertSyncStatusSafely } from '@/utils/supabase/upsert';
import { getValidGithubToken } from '@/services/auth/oauth';
import { scoreGithubEvent } from '@/utils/risk/scorer';
import { resolveSyncActor, type SyncActor, type SyncActorError } from '@/utils/sync/actor';

type GitHubRepo = {
  id: number;
  full_name: string;
  name: string;
  html_url: string;
  description: string | null;
  language: string | null;
  stargazers_count: number;
  forks_count: number;
  pushed_at: string | null;
  updated_at: string;
};

function formatDate(input: string | null) {
  if (!input) return new Date().toISOString();
  return new Date(input).toISOString();
}

export async function POST(request: Request) {
  let actor: SyncActor | SyncActorError | null = null;
  try {
    actor = await resolveSyncActor(request);
    if ('status' in actor) {
      return NextResponse.json({ error: actor.error }, { status: actor.status });
    }

    const { supabase, userId, userEmail, userName } = actor;

    // --- DATA LOCKDOWN GUARD ---
    const { data: activeAudit } = await supabase
      .from('reputation_audits')
      .select('id, status')
      .eq('user_id', userId)
      .in('status', ['pending', 'analysis', 'generating'])
      .maybeSingle();

    if (activeAudit) {
      return NextResponse.json({ 
        error: 'System Busy: Reputation Audit in progress.', 
        detail: 'Ingestion is paused to ensure data snapshot integrity for your current audit.' 
      }, { status: 423 });
    }

    // 1. Get existing sync status to find the current page cursor
    const { data: currentStatus } = await supabase
      .from('sync_status')
      .select('cursor, total_items')
      .eq('user_id', userId)
      .eq('platform', 'github')
      .maybeSingle();

    let accessToken: string | null = null;
    try {
      accessToken = await getValidGithubToken(supabase, userId);
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      console.error('github sync auth error:', detail);
      return NextResponse.json({ error: 'GitHub authentication failed.', detail }, { status: 401 });
    }

    if (!accessToken) {
      return NextResponse.json({ error: 'GitHub is not connected yet.' }, { status: 401 });
    }

    const url = new URL(request.url);
    const mode = url.searchParams.get('mode') || 'delta';
    const isBackfill = mode === 'backfill';
    const perPage = 100;
    // No cap in backfill mode — fetch all repos
    const maxTotal = isBackfill ? Infinity : 100;

    // Mark as 'syncing'
    await upsertSyncStatusSafely(supabase, {
      user_id: userId,
      platform: 'github',
      status: 'syncing',
      last_sync_at: new Date().toISOString(),
    });

    let allRepos: GitHubRepo[] = [];
    let page = parseInt(currentStatus?.cursor || '1');
    let hasMore = true;

    // --- PAGINATION LOOP ---
    while (allRepos.length < maxTotal && hasMore) {
      const repoResponse = await fetch(`https://api.github.com/user/repos?sort=updated&per_page=${perPage}&page=${page}`, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: 'application/vnd.github+json',
          'User-Agent': 'EYES-Memory-Engine', // GitHub requires User-Agent
          'X-GitHub-Api-Version': '2022-11-28',
        },
        cache: 'no-store',
      });

      if (!repoResponse.ok) {
        if (repoResponse.status === 401 || repoResponse.status === 403) {
          const detail = await repoResponse.text();
          throw new Error(`GitHub auth failed: ${repoResponse.status} ${detail}`);
        }

        hasMore = false;
        break;
      }

      const repos = (await repoResponse.json()) as GitHubRepo[];
      if (!repos || repos.length === 0) {
        hasMore = false;
        break;
      }

      allRepos = [...allRepos, ...repos];
      page += 1;
      if (repos.length < perPage) {
        hasMore = false;
        break;
      }
    }

    const now = new Date().toISOString();

    const rawEvents = await Promise.all(allRepos.map(async (repo) => {
      const description = repo.description || 'No description provided.';
      const content = [
        description,
        `Language: ${repo.language || 'Unknown'}`,
        `Stars: ${repo.stargazers_count} | Forks: ${repo.forks_count}`,
        `Repo: ${repo.html_url}`,
      ].join(' ');

      const risk = await scoreGithubEvent({
        title: repo.full_name,
        description,
        stars: repo.stargazers_count,
        forks: repo.forks_count,
        language: repo.language,
      });

      return {
        user_id: userId,
        platform: 'github',
        platform_id: String(repo.id),
        event_type: 'repository',
        title: repo.full_name,
        content,
        author: userEmail || userName || 'GitHub',
        timestamp: formatDate(repo.updated_at || repo.pushed_at),
        metadata: {
          html_url: repo.html_url,
          language: repo.language,
          stargazers_count: repo.stargazers_count,
          forks_count: repo.forks_count,
          pushed_at: repo.pushed_at,
          updated_at: repo.updated_at,
          risk_score: risk.score,
          risk_factors: risk.reasons,
        },
        is_flagged: risk.flagged,
        flag_severity: risk.severity,
        flag_reason: risk.reasons[0] || null,
      };
    }));

    await upsertRawEventsSafely(supabase, rawEvents);
    console.log(`[GitHub Sync] Upserted ${rawEvents.length} events for user ${userId}`);

    // Save the next page for the next run
    await Promise.all([
      upsertSyncStatusSafely(supabase, {
        user_id: userId,
        platform: 'github',
        status: hasMore ? 'syncing' : 'connected',
        sync_progress: hasMore ? 60 : 100,
        total_items: (currentStatus?.total_items || 0) + rawEvents.length,
        last_sync_at: now,
        next_sync_at: new Date(Date.now() + 1000 * 60 * 30).toISOString(),
        cursor: hasMore ? String(page) : null,
        error_message: null,
      }),
      supabase.from('user_profiles').update({
        // Cumulative total — not just current batch (H3 fix)
        memories_indexed: (currentStatus?.total_items || 0) + rawEvents.length,
        updated_at: now,
      }).eq('user_id', userId),
    ]);

    return NextResponse.json({
      ok: true,
      syncedRepos: rawEvents.length,
      hasMore,
    });
  } catch (error: unknown) {
    const detail = error instanceof Error ? error.message : String(error);
    console.error('github sync error:', error);

    // CRITICAL: Reset status in DB so UI is not frozen
    if (actor && 'supabase' in actor) {
      await upsertSyncStatusSafely(actor.supabase, {
        user_id: actor.userId,
        platform: 'github',
        status: 'error',
        error_message: detail.slice(0, 200)
      });
    }

    return NextResponse.json(
      { error: 'Unable to sync GitHub data.', detail },
      { status: 500 }
    );
  }
}
