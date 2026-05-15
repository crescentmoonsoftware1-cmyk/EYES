import type { SupabaseClient } from '@supabase/supabase-js';
import { createClient as createUserClient } from '@/utils/supabase/server';
import { createAdminClient } from '@/utils/supabase/admin';

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

export async function resolveSyncActor(request: Request): Promise<SyncActor | SyncActorError> {
  const cronSecretHeader = request.headers.get('x-cron-secret');
  const cronUserId = request.headers.get('x-cron-user-id');

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

    let supabase: SupabaseClient;
    try {
      supabase = createAdminClient();
    } catch {
      return {
        error: 'Server is missing admin configuration for cron sync.',
        status: 500,
      };
    }

    const { data, error } = await supabase.auth.admin.getUserById(cronUserId);
    if (error) {
      return { error: `Failed to resolve cron user: ${error.message}`, status: 500 };
    }

    if (!data.user) {
      return { error: 'Cron user not found.', status: 404 };
    }

    const userMetadata = data.user.user_metadata as { name?: string } | undefined;

    return {
      supabase,
      userId: cronUserId,
      userEmail: data.user.email ?? undefined,
      userName: userMetadata?.name,
      mode: 'cron',
    };
  }

  const userClient = await createUserClient();
  const { data: authData, error } = await userClient.auth.getUser();

  if (error || !authData.user) {
    return { error: 'Unauthorized', status: 401 };
  }

  // Use Admin Client for the actual sync operations to bypass RLS barriers in background
  const supabase = createAdminClient();
  const userMetadata = authData.user.user_metadata as { name?: string } | undefined;

  return {
    supabase,
    userId: authData.user.id,
    userEmail: authData.user.email ?? undefined,
    userName: userMetadata?.name,
    mode: 'session',
  };
}
