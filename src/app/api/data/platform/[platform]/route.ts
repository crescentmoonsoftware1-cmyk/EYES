import { NextResponse } from 'next/server';

import { writeDisconnectAudit } from '@/services/audit/disconnect-audit';
import {
  isRevocablePlatform,
  providerForPlatform,
  revokeProviderAccess,
  type ProviderRevocationResult,
} from '@/services/auth/provider-revocation';
import { createClient } from '@/utils/supabase/server';

const SUPPORTED_PLATFORMS = new Set([
  'github', 'gmail', 'google-calendar', 'google_calendar', 'reddit', 'notion', 
  'discord', 'slack', 'twitter', 'dropbox', 'asana', 'trello', 
  'linear', 'clickup', 'vercel', 'netlify', 'supabase', 'sentry', 'posthog', 
  'webflow', 'devin', 'cursor', 'canva', 'strava', 'fitbit', 
  'withings', 'ramp',
]);


function toDbPlatform(platform: string) {
  return platform === 'google-calendar' ? 'google_calendar' : platform;
}

function toRoutePlatform(platform: string) {
  return platform === 'google_calendar' ? 'google-calendar' : platform;
}

function toGoogleSibling(platform: string) {
  if (platform === 'gmail') return 'google_calendar';
  if (platform === 'google_calendar') return 'gmail';
  return null;
}

type TokenRow = {
  id: string;
  platform: string;
  access_token: string | null;
  refresh_token: string | null;
};

async function readDeleteOptions(request: Request) {
  try {
    const payload = (await request.json()) as { disconnect?: boolean };
    return {
      disconnect: Boolean(payload?.disconnect),
    };
  } catch {
    return { disconnect: false };
  }
}

function withPolicyHint(message: string) {
  const lower = message.toLowerCase();
  if (!lower.includes('row-level security')) {
    return message;
  }

  return `${message}. Apply supabase/migrations/003_data_lifecycle_rls_policies.sql and retry.`;
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ platform: string }> }
) {
  try {
    const { platform: routePlatform } = await params;

    if (!routePlatform || !SUPPORTED_PLATFORMS.has(routePlatform)) {
      return NextResponse.json({ error: 'Unsupported platform.' }, { status: 400 });
    }

    const platform = toDbPlatform(routePlatform);
    const { disconnect } = await readDeleteOptions(request);

    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const [{ count: eventCountBefore, error: countError }, { data: tokenRow }] = await Promise.all([
      supabase
        .from('memories')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .eq('platform', platform),
      supabase
        .from('oauth_tokens')
        .select('id,platform,access_token,refresh_token')
        .eq('user_id', user.id)
        .eq('platform', platform)
        .maybeSingle(),
    ]);

    if (countError) {
      throw countError;
    }

    const { error: purgeError } = await supabase
      .from('memories')
      .delete()
      .eq('user_id', user.id)
      .eq('platform', platform);

    if (purgeError) {
      return NextResponse.json(
        { error: withPolicyHint(purgeError.message || 'Failed to purge platform data.') },
        { status: 500 }
      );
    }

    const token = tokenRow as TokenRow | null;
    let revocation: ProviderRevocationResult | null = null;

    if (disconnect && token && isRevocablePlatform(platform)) {
      const googleSibling = toGoogleSibling(platform);

      if (googleSibling) {
        const { count: siblingTokenCount, error: siblingCountError } = await supabase
          .from('oauth_tokens')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', user.id)
          .eq('platform', googleSibling);

        if (siblingCountError) {
          throw siblingCountError;
        }

        if ((siblingTokenCount ?? 0) > 0) {
          revocation = {
            provider: providerForPlatform(platform),
            platform,
            attempted: false,
            status: 'skipped',
            httpStatus: null,
            message: `Skipped remote revoke because ${toRoutePlatform(googleSibling)} remains connected.`,
          };
        }
      }

      if (!revocation) {
        revocation = await revokeProviderAccess({
          platform,
          encryptedAccessToken: token.access_token,
          encryptedRefreshToken: token.refresh_token,
        });
      }
    }

    if (disconnect) {
      const [{ error: tokenDeleteError }, { error: syncDeleteError }] = await Promise.all([
        supabase
          .from('oauth_tokens')
          .delete()
          .eq('user_id', user.id)
          .eq('platform', platform),
        supabase
          .from('sync_status')
          .delete()
          .eq('user_id', user.id)
          .eq('platform', platform),
      ]);

      if (tokenDeleteError || syncDeleteError) {
        const message = tokenDeleteError?.message || syncDeleteError?.message || 'Failed to remove connection state.';
        return NextResponse.json({ error: withPolicyHint(message) }, { status: 500 });
      }
    } else {
      const status = tokenRow ? 'connected' : 'idle';
      const syncProgress = tokenRow ? 100 : 0;

      const { error: syncResetError } = await supabase
        .from('sync_status')
        .upsert(
          {
            user_id: user.id,
            platform,
            status,
            sync_progress: syncProgress,
            total_items: 0,
            last_sync_at: null,
            error_message: null,
          },
          { onConflict: 'user_id,platform' }
        );

      if (syncResetError) {
        return NextResponse.json(
          { error: withPolicyHint(syncResetError.message || 'Failed to reset sync status after purge.') },
          { status: 500 }
        );
      }
    }

    const { count: remainingMemories, error: remainingCountError } = await supabase
      .from('memories')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id);

    if (remainingCountError) {
      throw remainingCountError;
    }

    const { error: profileUpdateError } = await supabase
      .from('user_profiles')
      .update({
        memories_indexed: remainingMemories ?? 0,
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', user.id);

    if (profileUpdateError) {
      return NextResponse.json(
        { error: withPolicyHint(profileUpdateError.message || 'Platform data purged but profile count update failed.') },
        { status: 500 }
      );
    }

    if (isRevocablePlatform(platform)) {
      await writeDisconnectAudit(supabase, {
        userId: user.id,
        platform,
        action: disconnect ? 'disconnect' : 'purge_platform',
        disconnected: disconnect,
        deletedEventCount: eventCountBefore ?? 0,
        remainingMemories: remainingMemories ?? 0,
        revocation,
      });
    }

    return NextResponse.json({
      ok: true,
      platform: toRoutePlatform(platform),
      disconnected: disconnect,
      deletedEventCount: eventCountBefore ?? 0,
      remainingMemories: remainingMemories ?? 0,
      revocation,
    });
  } catch (error) {
    console.error('platform data purge error:', error);
    return NextResponse.json({ error: 'Failed to purge platform data.' }, { status: 500 });
  }
}
