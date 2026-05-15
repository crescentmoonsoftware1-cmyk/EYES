import type { SupabaseClient } from '@supabase/supabase-js';
import { createClient as createUserClient, createAdminClient } from '@/utils/supabase/server';

export type SyncActor = {
  supabase: SupabaseClient;
  userId: string;
  userEmail?: string;
  userName?: string;
  mode: 'session' | 'cron';
};

export type SyncActorError = {
  error: string;
  status: number;
};

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

/**
 * Resolves the acting entity for a sync operation.
 * Supports both User Session (Dashboard) and Cron Secret (Background) authentication.
 * ALWAYS returns an Admin Client for successful auth to ensure write permissions.
 */
export async function resolveSyncActor(request: Request): Promise<SyncActor | SyncActorError> {
  const cronSecretHeader = request.headers.get('x-cron-secret');
  const cronUserId = request.headers.get('x-cron-user-id');

  // --- CRON / BACKGROUND AUTH ---
  if (cronSecretHeader || cronUserId) {
    if (!cronSecretHeader || !cronUserId) {
      return { error: 'Missing cron authentication headers.', status: 401 };
    }

    const expectedSecret = process.env.CRON_SECRET;
    if (!expectedSecret || cronSecretHeader !== expectedSecret) {
      return { error: 'Unauthorized', status: 401 };
    }

    if (!isUuid(cronUserId)) {
      return { error: 'Invalid cron user id.', status: 400 };
    }

    try {
      const supabase = await createAdminClient();
      const { data, error } = await supabase.auth.admin.getUserById(cronUserId);
      
      if (error || !data.user) {
        return { error: `Failed to resolve cron user: ${error?.message || 'Not found'}`, status: 500 };
      }

      const userMetadata = data.user.user_metadata as { name?: string } | undefined;

      return {
        supabase,
        userId: cronUserId,
        userEmail: data.user.email ?? undefined,
        userName: userMetadata?.name,
        mode: 'cron',
      };
    } catch (err) {
      return { error: 'Server configuration error in background worker.', status: 500 };
    }
  }

  // --- SESSION / DASHBOARD AUTH ---
  try {
    const userClient = await createUserClient();
    const { data: authData, error } = await userClient.auth.getUser();

    if (error || !authData.user) {
      return { error: 'Unauthorized', status: 401 };
    }

    // Upgrade to Admin Client for the sync process to bypass RLS
    const supabase = await createAdminClient();
    const userMetadata = authData.user.user_metadata as { name?: string } | undefined;

    return {
      supabase,
      userId: authData.user.id,
      userEmail: authData.user.email ?? undefined,
      userName: userMetadata?.name,
      mode: 'session',
    };
  } catch (err) {
    return { error: 'Failed to initialize neural session.', status: 500 };
  }
}
