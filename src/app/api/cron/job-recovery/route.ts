import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/utils/supabase/admin';
import { getRecoverableFailedJobs, markJobAsRecovered } from '@/utils/monitoring';

// Direct sync route imports for in-process calling (faster and more reliable in Vercel limits)
import { POST as syncGithub } from '@/app/api/sync/github/route';
import { POST as syncGmail } from '@/app/api/sync/gmail/route';
import { POST as syncGoogleCalendar } from '@/app/api/sync/google-calendar/route';
import { POST as syncNotion } from '@/app/api/sync/notion/route';
import { POST as syncReddit } from '@/app/api/sync/reddit/route';
import { POST as syncSlack } from '@/app/api/sync/slack/route';
import { POST as syncDiscord } from '@/app/api/sync/discord/route';
import { POST as syncEmbeddings } from '@/app/api/sync/embeddings/route';

function toSyncRoutePlatform(platform: string) {
  if (platform === 'google_calendar') return 'google-calendar';
  return platform.replace(/_/g, '-');
}

function getSyncHandler(routePlatform: string) {
  switch (routePlatform) {
    case 'github': return syncGithub;
    case 'gmail': return syncGmail;
    case 'google-calendar': return syncGoogleCalendar;
    case 'notion': return syncNotion;
    case 'reddit': return syncReddit;
    case 'slack': return syncSlack;
    case 'discord': return syncDiscord;
    default: return null;
  }
}

function getCronSecret(request: Request): string | null {
  const authHeader = request.headers.get('authorization');
  if (authHeader?.startsWith('Bearer ')) {
    return authHeader.slice('Bearer '.length).trim();
  }

  const xSecret = request.headers.get('x-cron-secret');
  if (xSecret) return xSecret.trim();

  const url = new URL(request.url);
  return url.searchParams.get('secret')?.trim() || null;
}

function isAuthorizedCron(request: Request): boolean {
  const expectedSecret = process.env.CRON_SECRET;
  if (!expectedSecret) return false;

  const providedSecret = getCronSecret(request);
  return !!providedSecret && providedSecret === expectedSecret;
}

function resolveBaseUrl(request: Request) {
  const host = request.headers.get('host');
  if (host) {
    const protocol = host.includes('localhost') ? 'http' : 'https';
    return `${protocol}://${host}`;
  }

  if (process.env.NEXT_PUBLIC_SITE_URL) {
    return process.env.NEXT_PUBLIC_SITE_URL.replace(/\/$/, '');
  }

  return new URL(request.url).origin;
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal,
      cache: 'no-store',
    });
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function POST(req: NextRequest) {
  if (!isAuthorizedCron(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createAdminClient();
  const baseUrl = resolveBaseUrl(req);
  const secret = process.env.CRON_SECRET || '';

  // Get up to 10 recoverable failed jobs to process this run
  const recoverableJobs = await getRecoverableFailedJobs(supabase, 10);
  const results = [];

  for (const job of recoverableJobs) {
    // 1. Fetch current attempt count and max attempts from database
    const { data: dbJob } = await supabase
      .from('async_job_failures')
      .select('recovery_attempts, max_recovery_attempts')
      .eq('job_id', job.jobId)
      .single();

    const currentAttempts = (dbJob?.recovery_attempts ?? 0) + 1;
    const maxAttempts = dbJob?.max_recovery_attempts ?? 3;

    // 2. Mark job as in-progress and increment attempts
    await supabase
      .from('async_job_failures')
      .update({
        recovery_status: 'in_progress',
        recovery_attempts: currentAttempts,
        last_recovery_attempt: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('job_id', job.jobId);

    let success = false;
    let errorDetail = '';

    try {
      if (job.type === 'sync') {
        const routePlatform = toSyncRoutePlatform(job.platform);
        const handler = getSyncHandler(routePlatform);

        if (handler) {
          // Direct function execution
          const requestUrl = new URL(`${baseUrl}/api/sync/${routePlatform}`);
          const response = await handler(
            new Request(requestUrl.toString(), {
              method: 'POST',
              headers: {
                'x-cron-secret': secret,
                'x-cron-user-id': job.userId,
              },
            })
          );
          success = response.ok;
          if (!success) {
            errorDetail = `Direct sync failed with status ${response.status}`;
          }
        } else {
          // HTTP sub-request fallback for other dynamic connectors
          const requestUrl = `${baseUrl}/api/sync/${routePlatform}`;
          const response = await fetchWithTimeout(
            requestUrl,
            {
              method: 'POST',
              headers: {
                'x-cron-secret': secret,
                'x-cron-user-id': job.userId,
              },
            },
            60000 // 60s timeout for individual recovery
          );
          success = response.ok;
          if (!success) {
            errorDetail = `HTTP sync fallback failed with status ${response.status}`;
          }
        }
      } else if (job.type === 'embedding') {
        // Embeddings Sync execution
        const requestUrl = new URL(`${baseUrl}/api/sync/embeddings`);
        const response = await syncEmbeddings(
          new Request(requestUrl.toString(), {
            method: 'POST',
            headers: {
              'x-cron-secret': secret,
              'x-cron-user-id': job.userId,
            },
          })
        );
        success = response.ok;
        if (!success) {
          errorDetail = `Embeddings sync failed with status ${response.status}`;
        }
      } else {
        errorDetail = `Unknown job type: ${job.type}`;
      }
    } catch (err) {
      errorDetail = err instanceof Error ? err.message : String(err);
    }

    // 3. Update job outcome
    if (success) {
      await markJobAsRecovered(supabase, job.jobId);
      results.push({ jobId: job.jobId, type: job.type, platform: job.platform, status: 'succeeded' });
    } else {
      const isAbandoned = currentAttempts >= maxAttempts;
      await supabase
        .from('async_job_failures')
        .update({
          recovery_status: isAbandoned ? 'abandoned' : 'failed',
          error_message: `Recovery attempt ${currentAttempts} failed: ${errorDetail}`.slice(0, 500),
          updated_at: new Date().toISOString(),
        })
        .eq('job_id', job.jobId);

      results.push({
        jobId: job.jobId,
        type: job.type,
        platform: job.platform,
        status: isAbandoned ? 'abandoned' : 'failed',
        error: errorDetail,
      });
    }
  }

  return NextResponse.json({ processed: results.length, results });
}
