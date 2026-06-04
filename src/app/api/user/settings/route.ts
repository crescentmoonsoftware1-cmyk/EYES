import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

/**
 * Global user settings store — risk sensitivity, sync depth, excluded senders.
 * Uses the connector_settings table with a special platform key 'user_global'.
 */

export async function GET() {
  const supabase = await createClient();
  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const [settingsResult, profileResult] = await Promise.all([
    supabase
      .from('connector_settings')
      .select('data_types')
      .eq('user_id', user.id)
      .eq('platform', 'user_global')
      .maybeSingle(),
    supabase
      .from('user_profiles')
      .select('behavior_logging_consent')
      .eq('user_id', user.id)
      .maybeSingle(),
  ]);

  if (settingsResult.error && settingsResult.error.code !== 'PGRST116') {
    console.error('[UserSettings] GET failed:', settingsResult.error);
    return NextResponse.json({ error: 'Failed to load settings.' }, { status: 500 });
  }

  // data_types is repurposed here as a JSON blob stored as string array with one entry
  const raw = settingsResult.data?.data_types?.[0];
  let settings = { riskSensitivity: 'MEDIUM', syncDepth: 'balanced', excludedSenders: [] as string[], gdprConsent: true };
  if (raw) {
    try { settings = { ...settings, ...JSON.parse(raw) }; } catch {}
  }

  settings.gdprConsent = profileResult.data?.behavior_logging_consent ?? true;

  return NextResponse.json(settings);
}

export async function PUT(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });

  const settings = {
    riskSensitivity: body.riskSensitivity ?? 'MEDIUM',
    syncDepth: body.syncDepth ?? 'balanced',
    excludedSenders: Array.isArray(body.excludedSenders) ? body.excludedSenders : [],
  };

  const promises: Promise<any>[] = [
    supabase
      .from('connector_settings')
      .upsert({
        user_id: user.id,
        platform: 'user_global',
        data_types: [JSON.stringify(settings)],
        sync_enabled: true,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id,platform' }),
  ];

  if (body.gdprConsent !== undefined) {
    promises.push(
      supabase
        .from('user_profiles')
        .update({ behavior_logging_consent: body.gdprConsent })
        .eq('user_id', user.id)
    );
  }

  const results = await Promise.all(promises);
  const settingsError = results[0].error;
  const profileError = results[1]?.error;

  if (settingsError || profileError) {
    console.error('[UserSettings] PUT failed:', settingsError || profileError);
    return NextResponse.json({ error: 'Failed to save settings.' }, { status: 500 });
  }

  return NextResponse.json({ ok: true, settings: { ...settings, gdprConsent: body.gdprConsent } });
}
