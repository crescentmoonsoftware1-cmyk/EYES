import { NextResponse } from 'next/server';

import { createClient } from '@/utils/supabase/server';

const SUPPORTED_PLATFORMS = new Set(['github', 'gmail', 'google-calendar', 'google_calendar', 'reddit', 'notion']);

function toDbPlatform(platform: string) {
  return platform === 'google-calendar' ? 'google_calendar' : platform;
}

function isMissingTable(errorCode?: string) {
  return errorCode === '42P01';
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ platform: string }> }
) {
  try {
    const { platform: routePlatform } = await params;

    if (!routePlatform || !SUPPORTED_PLATFORMS.has(routePlatform)) {
      return NextResponse.json({ error: 'Unsupported platform.' }, { status: 400 });
    }

    const platform = toDbPlatform(routePlatform);
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data, error } = await supabase
      .from('connector_settings')
      .select('platform,data_types,sync_enabled,updated_at')
      .eq('user_id', user.id)
      .eq('platform', platform)
      .maybeSingle();

    if (error) {
      if (isMissingTable(error.code)) {
        return NextResponse.json(
          {
            platform,
            dataTypes: [],
            syncEnabled: true,
            warning: 'connector_settings table is not available. Apply migration 011_connector_settings.sql.',
          },
          { status: 200 }
        );
      }

      throw error;
    }

    return NextResponse.json(
      {
        platform,
        dataTypes: Array.isArray(data?.data_types) ? data?.data_types : [],
        syncEnabled: data?.sync_enabled ?? true,
        updatedAt: data?.updated_at ?? null,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('connector settings fetch error:', error);
    return NextResponse.json({ error: 'Failed to load connector settings.' }, { status: 500 });
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ platform: string }> }
) {
  try {
    const { platform: routePlatform } = await params;

    if (!routePlatform || !SUPPORTED_PLATFORMS.has(routePlatform)) {
      return NextResponse.json({ error: 'Unsupported platform.' }, { status: 400 });
    }

    const platform = toDbPlatform(routePlatform);
    const payload = (await request.json().catch(() => null)) as {
      dataTypes?: unknown;
      syncEnabled?: unknown;
    } | null;

    const dataTypes = Array.isArray(payload?.dataTypes)
      ? payload?.dataTypes.filter((value): value is string => typeof value === 'string').slice(0, 40)
      : [];

    const syncEnabled = typeof payload?.syncEnabled === 'boolean' ? payload.syncEnabled : true;

    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data, error } = await supabase
      .from('connector_settings')
      .upsert(
        {
          user_id: user.id,
          platform,
          data_types: dataTypes,
          sync_enabled: syncEnabled,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id,platform' }
      )
      .select('platform,data_types,sync_enabled,updated_at')
      .maybeSingle();

    if (error) {
      if (isMissingTable(error.code)) {
        return NextResponse.json(
          {
            error: 'connector_settings table is not available. Apply migration 011_connector_settings.sql.',
          },
          { status: 503 }
        );
      }

      throw error;
    }

    return NextResponse.json(
      {
        ok: true,
        platform,
        dataTypes: data?.data_types ?? dataTypes,
        syncEnabled: data?.sync_enabled ?? syncEnabled,
        updatedAt: data?.updated_at ?? null,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('connector settings update error:', error);
    return NextResponse.json({ error: 'Failed to update connector settings.' }, { status: 500 });
  }
}
