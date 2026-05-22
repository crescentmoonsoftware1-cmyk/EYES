import { NextResponse } from 'next/server';

import { upsertRawEventsSafely, upsertSyncStatusSafely } from '@/utils/supabase/upsert';
import { getValidGoogleToken } from '@/services/auth/oauth';
import { scoreGmailEvent } from '@/utils/risk/scorer';
import { resolveSyncActor, type SyncActor, type SyncActorError } from '@/utils/sync/actor';

type GmailListResponse = {
  messages?: Array<{ id: string }>;
};

type GmailMessageResponse = {
  id: string;
  snippet?: string;
  internalDate?: string;
  payload?: {
    headers?: Array<{ name: string; value: string }>;
    body?: {
      data?: string;
    };
    parts?: GmailMessagePart[];
  };
};

type GmailMessagePart = {
  mimeType?: string;
  body?: {
    data?: string;
  };
  parts?: GmailMessagePart[];
};

function getHeader(headers: Array<{ name: string; value: string }> | undefined, key: string) {
  return headers?.find((header) => header.name.toLowerCase() === key.toLowerCase())?.value;
}

function decodeBase64Url(value: string) {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
  return Buffer.from(padded, 'base64').toString('utf8');
}

function extractTextFromPart(part: GmailMessagePart | undefined): string {
  if (!part) return '';

  const mimeType = part.mimeType || '';
  const ownText = part.body?.data ? decodeBase64Url(part.body.data) : '';

  if (mimeType.startsWith('text/plain') && ownText) {
    return ownText;
  }

  const nested = (part.parts || []).map(extractTextFromPart).filter(Boolean).join('\n');
  if (nested) return nested;

  if (mimeType.startsWith('text/html') && ownText) {
    return ownText
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  return ownText;
}

export async function POST(request: Request) {
  let actor: SyncActor | SyncActorError | null = null;
  try {
    actor = await resolveSyncActor(request);
    if ('status' in actor) {
      return NextResponse.json({ error: actor.error }, { status: actor.status });
    }

    const { supabase, userId } = actor;
    
    // --- DATA LOCKDOWN GUARD ---
    // Prevent ingestion while an Audit is in progress to ensure snapshot integrity
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
      }, { status: 423 }); // 423 Locked
    }

    // 1. Get existing sync status to find the cursor
    const { data: currentStatus } = await supabase
      .from('sync_status')
      .select('cursor, total_items')
      .eq('user_id', userId)
      .eq('platform', 'gmail')
      .maybeSingle();

    const startTime = Date.now();
    const MAX_RUN_TIME = 22000; // 22 seconds (Vercel Hobby limit is 10s, Pro is 60s - 22s is a safe middle ground)
    const maxResultsPerPage = 100;
    const isBackfill = new URL(request.url).searchParams.get('backfill') === 'true';
    // Cap total results per individual run to prevent memory bloat and timeouts
    const maxTotalResults = isBackfill ? 500 : 200;

    // Mark as 'syncing'
    await upsertSyncStatusSafely(supabase, {
      user_id: userId,
      platform: 'gmail',
      status: 'syncing',
      last_sync_at: new Date().toISOString(),
    });

    const accessToken = await getValidGoogleToken(supabase, userId, 'gmail');
    if (!accessToken) {
      return NextResponse.json({ error: 'Gmail session expired and refresh failed.' }, { status: 401 });
    }

    let allMessageIds: string[] = [];
    let nextPageToken: string | undefined = isBackfill
      ? (currentStatus?.cursor || undefined)
      : undefined;
    let hasMore = true;

    // --- PAGINATION LOOP (with safety throttle) ---
    while (allMessageIds.length < maxTotalResults && hasMore) {
      // Check if we are running out of time in the serverless execution window
      if (Date.now() - startTime > MAX_RUN_TIME) {
        console.log(`[Gmail Sync] Approaching timeout (${Date.now() - startTime}ms). Pausing run.`);
        break;
      }

      const fetchUrl = new URL('https://gmail.googleapis.com/gmail/v1/users/me/messages');
      fetchUrl.searchParams.set('maxResults', String(maxResultsPerPage));
      if (nextPageToken) fetchUrl.searchParams.set('pageToken', nextPageToken);

      const listResponse = await fetch(fetchUrl.toString(), {
        headers: { Authorization: `Bearer ${accessToken}` },
        cache: 'no-store',
      });

      if (!listResponse.ok) {
        hasMore = false;
        break;
      }

      const listBody = (await listResponse.json()) as { messages?: Array<{ id: string }>, nextPageToken?: string };
      const pageIds = (listBody.messages ?? []).map((m) => m.id);
      allMessageIds = [...allMessageIds, ...pageIds];

      nextPageToken = listBody.nextPageToken;
      if (!nextPageToken) {
        hasMore = false;
        break;
      }
      
      await new Promise(resolve => setTimeout(resolve, 150));
    }

    const messages: GmailMessageResponse[] = [];
    const chunkSize = 25; // 25 requests = 125 quota units (Safe limit is 250/sec)

    // --- RATE LIMIT SHIELD ---
    for (let i = 0; i < allMessageIds.length; i += chunkSize) {
      // Check if we are running out of time
      if (Date.now() - startTime > MAX_RUN_TIME) {
        console.log(`[Gmail Sync] Timeout safety triggered during message fetch (${Date.now() - startTime}ms). Saving progress.`);
        hasMore = true; // Ensure we mark as syncing/hasMore to pick up the cursor later
        break;
      }

      const chunkIds = allMessageIds.slice(i, i + chunkSize);
      let attempt = 0;
      let success = false;

      while (attempt < 3 && !success) {
        try {
          const chunkResponses = await Promise.all(
            chunkIds.map(async (id) => {
              const res = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}?format=full&metadataHeaders=Subject&metadataHeaders=From`, {
                headers: { Authorization: `Bearer ${accessToken}` },
                cache: 'no-store',
              });
              
              if (res.status === 429) throw new Error('RATE_LIMIT');
              return res.ok ? res.json() : null;
            })
          );
          
          messages.push(...(chunkResponses.filter(Boolean) as GmailMessageResponse[]));
          success = true;
          
          if (i + chunkSize < allMessageIds.length) {
            await new Promise(resolve => setTimeout(resolve, 800)); // Respect Google's 1-sec token bucket
          }
        } catch (err) {
          attempt++;
          console.warn(`[Gmail Sync] Rate limit hit. Backing off (Attempt ${attempt}/3)...`);
          if (attempt >= 3) {
            console.error('[Gmail Sync] Max retries hit. Saving progress and aborting run.');
            break; 
          }
          await new Promise(resolve => setTimeout(resolve, attempt * 2500)); // Exponential backoff: 2.5s, 5s
        }
      }
    }

    const events = await Promise.all(messages.map(async (message) => {
      const subject = getHeader(message.payload?.headers, 'Subject') || 'No subject';
      const from = getHeader(message.payload?.headers, 'From') || 'Unknown sender';
      const bodyText = extractTextFromPart({
        mimeType: 'multipart/mixed',
        body: message.payload?.body,
        parts: message.payload?.parts,
      });
      const content = `${subject}\n${message.snippet || ''}\n${bodyText}`.trim().slice(0, 12000);
      const ts = message.internalDate ? new Date(Number(message.internalDate)).toISOString() : new Date().toISOString();
      const risk = await scoreGmailEvent({
        subject,
        snippet: `${message.snippet || ''} ${bodyText.slice(0, 1500)}`.trim(),
        from,
      });

      return {
        user_id: userId,
        platform: 'gmail',
        platform_id: message.id,
        event_type: 'email',
        title: subject,
        content,
        author: from,
        timestamp: ts,
        metadata: {
          from,
          snippet: message.snippet || null,
          body_indexed: bodyText.length > 0,
          risk_score: risk.score,
          risk_factors: risk.reasons,
        },
        is_flagged: risk.flagged,
        flag_severity: risk.severity,
        flag_reason: risk.reasons[0] || null,
      };
    }));

    // upsertRawEventsSafely: stores to unified memories table
    await upsertRawEventsSafely(supabase, events);
    console.log(`[Gmail Sync] Upserted ${events.length} events for user ${userId}`);

    // Save the new cursor (nextPageToken) back to Supabase
    await Promise.all([
      upsertSyncStatusSafely(supabase, {
        user_id: userId,
        platform: 'gmail',
        status: hasMore ? 'syncing' : 'connected',
        sync_progress: hasMore ? 50 : 100,
        total_items: (currentStatus?.total_items || 0) + events.length,
        last_sync_at: new Date().toISOString(),
        next_sync_at: new Date(Date.now() + 1000 * 60 * 30).toISOString(),
        cursor: hasMore ? nextPageToken : null,
        error_message: null,
      }),
      supabase.from('user_profiles').update({
        // Use cumulative total (same as sync_status.total_items) — not just current batch
        memories_indexed: (currentStatus?.total_items || 0) + events.length,
        updated_at: new Date().toISOString(),
      }).eq('user_id', userId),
    ]);

    return NextResponse.json({
      ok: true,
      syncedMessages: events.length,
      hasMore,
    });
  } catch (error: unknown) {
    const detail = error instanceof Error ? error.message : String(error);
    console.error('gmail sync error:', error);

    // CRITICAL: Reset status in DB so UI is not frozen
    if (actor && 'supabase' in actor) {
      await upsertSyncStatusSafely(actor.supabase, {
        user_id: actor.userId,
        platform: 'gmail',
        status: 'error',
        error_message: detail.slice(0, 200)
      });
    }

    return NextResponse.json({ 
      error: 'Unable to sync Gmail data.', 
      detail
    }, { status: 500 });
  }
}
