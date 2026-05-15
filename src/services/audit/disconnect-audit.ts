import type { SupabaseClient } from '@supabase/supabase-js';

import type { ProviderRevocationResult, RevocablePlatform } from '@/services/auth/provider-revocation';

export type DisconnectAuditAction = 'disconnect' | 'purge_platform' | 'purge_account';

type DisconnectAuditPayload = {
  userId: string;
  platform: RevocablePlatform;
  action: DisconnectAuditAction;
  disconnected: boolean;
  deletedEventCount?: number;
  remainingMemories?: number;
  revocation?: ProviderRevocationResult | null;
  metadata?: Record<string, unknown>;
};

function isMissingTable(errorCode?: string) {
  return errorCode === '42P01';
}

export async function writeDisconnectAudit(supabase: SupabaseClient, payload: DisconnectAuditPayload) {
  const {
    userId,
    platform,
    action,
    disconnected,
    deletedEventCount = 0,
    remainingMemories,
    revocation,
    metadata,
  } = payload;

  const { error } = await supabase.from('provider_disconnect_audits').insert({
    user_id: userId,
    platform,
    action,
    disconnected,
    deleted_event_count: Math.max(0, Math.floor(deletedEventCount || 0)),
    remaining_memories: typeof remainingMemories === 'number' ? Math.max(0, Math.floor(remainingMemories)) : null,
    revocation_provider: revocation?.provider ?? null,
    revocation_status: revocation?.status ?? null,
    revocation_http_status: revocation?.httpStatus ?? null,
    revocation_message: revocation?.message ?? null,
    metadata: metadata ?? {},
  });

  if (!error) {
    return;
  }

  if (isMissingTable(error.code)) {
    console.warn('[Lifecycle] provider_disconnect_audits table not found. Apply migration 010_provider_disconnect_audits.sql.');
    return;
  }

  console.warn('[Lifecycle] Failed to persist disconnect audit:', error.message);
}
