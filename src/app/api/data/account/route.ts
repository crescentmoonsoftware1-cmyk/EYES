import { NextResponse } from 'next/server';

import { writeDisconnectAudit } from '@/services/audit/disconnect-audit';
import {
  isRevocablePlatform,
  providerForPlatform,
  revokeProviderAccess,
  type ProviderName,
  type ProviderRevocationResult,
  type RevocablePlatform,
} from '@/services/auth/provider-revocation';
import { createClient } from '@/utils/supabase/server';

const ACCOUNT_PURGE_CONFIRMATION = 'DELETE_ALL_DATA';
const ACCOUNT_PURGE_REAUTH_WINDOW_MINUTES = 30;

type PurgeRequestBody = {
  confirm?: string;
};

async function readPurgeBody(request: Request): Promise<PurgeRequestBody> {
  try {
    const payload = (await request.json()) as PurgeRequestBody;
    return payload ?? {};
  } catch {
    return {};
  }
}

function minutesSince(iso: string | null | undefined) {
  if (!iso) return Number.POSITIVE_INFINITY;
  const time = new Date(iso).getTime();
  if (Number.isNaN(time)) return Number.POSITIVE_INFINITY;
  return (Date.now() - time) / 60000;
}

function withPolicyHint(message: string) {
  const lower = message.toLowerCase();
  if (!lower.includes('row-level security')) {
    return message;
  }

  return `${message}. Apply supabase/migrations/003_data_lifecycle_rls_policies.sql and retry.`;
}

export async function DELETE(request: Request) {
  try {
    const payload = await readPurgeBody(request);

    if (payload.confirm !== ACCOUNT_PURGE_CONFIRMATION) {
      return NextResponse.json(
        {
          error: `Missing confirmation. Send {"confirm":"${ACCOUNT_PURGE_CONFIRMATION}"} to proceed with account purge.`,
        },
        { status: 400 }
      );
    }

    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const {
      data: { session },
      error: sessionError,
    } = await supabase.auth.getSession();

    if (sessionError) {
      return NextResponse.json({ error: 'Unable to verify session freshness.' }, { status: 401 });
    }

    const lastSignInAt = session?.user?.last_sign_in_at ?? user.last_sign_in_at ?? null;
    const staleMinutes = minutesSince(lastSignInAt);
    if (staleMinutes > ACCOUNT_PURGE_REAUTH_WINDOW_MINUTES) {
      return NextResponse.json(
        {
          error: 'Recent re-authentication required before deleting all account data. Please sign out and sign back in, then retry.',
          reauthRequired: true,
          reauthWindowMinutes: ACCOUNT_PURGE_REAUTH_WINDOW_MINUTES,
          lastSignInAt,
        },
        { status: 428 }
      );
    }

    const [
      { count: rawEventsBefore },
      { count: topicsBefore },
      { count: syncStatusBefore },
      { count: tokenBefore },
      { count: chatThreadsBefore },
      { data: tokenRows },
    ] = await Promise.all([
      supabase.from('memories').select('id', { count: 'exact', head: true }).eq('user_id', user.id),
      supabase.from('topics').select('id', { count: 'exact', head: true }).eq('user_id', user.id),
      supabase.from('sync_status').select('id', { count: 'exact', head: true }).eq('user_id', user.id),
      supabase.from('oauth_tokens').select('id', { count: 'exact', head: true }).eq('user_id', user.id),
      supabase.from('chat_threads').select('id', { count: 'exact', head: true }).eq('user_id', user.id),
      supabase
        .from('oauth_tokens')
        .select('platform,access_token,refresh_token')
        .eq('user_id', user.id),
    ]);

    const revocations: ProviderRevocationResult[] = [];
    const revokedProviders = new Set<ProviderName>();

    for (const row of tokenRows ?? []) {
      const platform = row.platform;
      if (!isRevocablePlatform(platform)) {
        continue;
      }

      const provider = providerForPlatform(platform);
      if (revokedProviders.has(provider)) {
        continue;
      }

      revokedProviders.add(provider);
      revocations.push(
        await revokeProviderAccess({
          platform,
          encryptedAccessToken: row.access_token,
          encryptedRefreshToken: row.refresh_token,
        })
      );
    }

    // ── Critical deletes: hard errors if they fail ────────────────────────────
    const { error: topicsDeleteError } = await supabase.from('topics').delete().eq('user_id', user.id);
    if (topicsDeleteError) {
      return NextResponse.json({ error: withPolicyHint(topicsDeleteError.message || 'Failed to delete topics.') }, { status: 500 });
    }

    const { error: memoriesDeleteError } = await supabase.from('memories').delete().eq('user_id', user.id);
    if (memoriesDeleteError) {
      return NextResponse.json({ error: withPolicyHint(memoriesDeleteError.message || 'Failed to delete memories.') }, { status: 500 });
    }

    const { error: syncDeleteError } = await supabase.from('sync_status').delete().eq('user_id', user.id);
    if (syncDeleteError) {
      return NextResponse.json({ error: withPolicyHint(syncDeleteError.message || 'Failed to delete sync state.') }, { status: 500 });
    }

    const { error: chatThreadsDeleteError } = await supabase.from('chat_threads').delete().eq('user_id', user.id);
    if (chatThreadsDeleteError) {
      return NextResponse.json({ error: withPolicyHint(chatThreadsDeleteError.message || 'Failed to delete chat history.') }, { status: 500 });
    }

    const { error: chatMessagesDeleteError } = await supabase.from('chat_messages').delete().eq('user_id', user.id);
    if (chatMessagesDeleteError) {
      return NextResponse.json({ error: withPolicyHint(chatMessagesDeleteError.message || 'Failed to delete chat messages.') }, { status: 500 });
    }

    const { error: tokenDeleteError } = await supabase.from('oauth_tokens').delete().eq('user_id', user.id);
    if (tokenDeleteError) {
      return NextResponse.json({ error: withPolicyHint(tokenDeleteError.message || 'Failed to delete OAuth tokens.') }, { status: 500 });
    }

    // ── Cognitive / derived data: GDPR right-to-erasure covers derived data ──
    // Best-effort: log failures but don't abort — raw data already gone above.
    const cognitiveTableErrors: string[] = [];
    const cognitiveTables = [
      'cognitive_clusters',
      'detected_loops',
      'drift_snapshots',
      'state_vectors',
      'entities',
      'entity_correlations',
      'query_behavior',
      'reputation_audits',
      'alerts',
      'connector_settings',
      'sync_run_logs',
      'sync_retry_queue',
      'sync_retry_dead_letters',
    ] as const;

    await Promise.all(
      cognitiveTables.map(async (table) => {
        const { error } = await supabase.from(table).delete().eq('user_id', user.id);
        if (error) {
          console.warn(`[GDPR Purge] Failed to delete from ${table}:`, error.message);
          cognitiveTableErrors.push(table);
        }
      })
    );

    const { error: profileUpdateError } = await supabase
      .from('user_profiles')
      .update({ memories_indexed: 0, updated_at: new Date().toISOString() })
      .eq('user_id', user.id);

    if (profileUpdateError) {
      return NextResponse.json(
        { error: withPolicyHint(profileUpdateError.message || 'Data deleted but profile update failed.') },
        { status: 500 }
      );
    }

    await Promise.all(
      revocations.map((revocation) =>
        writeDisconnectAudit(supabase, {
          userId: user.id,
          platform: revocation.platform as RevocablePlatform,
          action: 'purge_account',
          disconnected: true,
          deletedEventCount: rawEventsBefore ?? 0,
          remainingMemories: 0,
          revocation,
          metadata: {
            scope: 'account',
          },
        })
      )
    );

    return NextResponse.json({
      ok: true,
      deleted: {
        rawEvents: rawEventsBefore ?? 0,
        chatThreads: chatThreadsBefore ?? 0,
        topics: topicsBefore ?? 0,
        syncStatusRows: syncStatusBefore ?? 0,
        oauthTokens: tokenBefore ?? 0,
      },
      cognitiveTablesErased: cognitiveTables.filter(t => !cognitiveTableErrors.includes(t)),
      ...(cognitiveTableErrors.length > 0 && { cognitiveTableWarnings: cognitiveTableErrors }),
      revocations,
      guardrails: {
        confirmed: true,
        recentReauthVerified: true,
        reauthWindowMinutes: ACCOUNT_PURGE_REAUTH_WINDOW_MINUTES,
      },
      message: 'All indexed, cognitive, and derived data has been erased for this account.',
    });
  } catch (error) {
    console.error('account data purge error:', error);
    return NextResponse.json({ error: 'Failed to purge account data.' }, { status: 500 });
  }
}
