import { NextResponse } from 'next/server';

import { createClient } from '@/utils/supabase/server';

type PlatformId = 
  | 'gmail' | 'github' | 'notion' | 'google-calendar' | 'discord' | 'slack' | 'twitter' | 'dropbox'
  | 'asana' | 'trello' | 'linear' | 'clickup'
  | 'vercel' | 'netlify' | 'supabase' | 'sentry' | 'posthog' | 'webflow' | 'devin' | 'cursor'
  | 'canva'
  | 'strava' | 'fitbit' | 'withings'
  | 'sonos' | 'philips-hue' | 'zoom' | 'hubspot' | 'salesforce' | 'jira' | 'confluence' | 'aws' | 'gcp' | 'azure' | 'quickbooks' | 'xero' | 'sap' | 'excel' | 'stripe' | 'tableau' | 'monday' | 'mailchimp' | 'google-analytics' | 'meta-ads' | 'linkedin-ads' | 'productboard' | 'figma' | 'mixpanel' | 'datadog' | 'linkedin-sales-navigator' | 'ms-project' | 'azure-devops' | 'miro' | 'gitlab' | 'vscode' | 'postman' | 'docker' | 'stack-overflow';

type PlatformReadiness = {
  id: PlatformId;
  name: string;
  connectionType: 'OAuth' | 'APIKey';
  requiredScopes: string[];
  optional: boolean;
  deferred: boolean;
  configured: boolean;
  missingEnv: string[];
  connected: boolean;
  status: 'idle' | 'connecting' | 'authenticating' | 'syncing' | 'connected' | 'error';
  syncProgress: number;
  items: number;
  lastSyncAt: string | null;
  errorMessage: string | null;
};

const platformConfigs: Array<{
  id: PlatformId;
  name: string;
  env: string[];
  scopes: string[];
  optional?: boolean;
}> = [
  {
    id: 'github',
    name: 'GitHub',
    env: ['GITHUB_CLIENT_ID', 'GITHUB_CLIENT_SECRET', 'NEXT_PUBLIC_SITE_URL', 'TOKEN_ENCRYPTION_KEY'],
    scopes: ['read:user', 'repo'],
  },
  {
    id: 'gmail',
    name: 'Gmail',
    env: ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'NEXT_PUBLIC_SITE_URL', 'TOKEN_ENCRYPTION_KEY'],
    scopes: ['gmail.readonly', 'openid', 'email', 'profile'],
  },
  {
    id: 'google-calendar',
    name: 'Google Calendar',
    env: ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'NEXT_PUBLIC_SITE_URL', 'TOKEN_ENCRYPTION_KEY'],
    scopes: ['calendar.readonly', 'openid', 'email', 'profile'],
  },
  {
    id: 'notion',
    name: 'Notion',
    env: ['NOTION_CLIENT_ID', 'NOTION_CLIENT_SECRET', 'NEXT_PUBLIC_SITE_URL', 'TOKEN_ENCRYPTION_KEY'],
    scopes: ['read content', 'read user'],
  },
  {
    id: 'slack',
    name: 'Slack',
    env: ['SLACK_CLIENT_ID', 'SLACK_CLIENT_SECRET', 'NEXT_PUBLIC_SITE_URL', 'TOKEN_ENCRYPTION_KEY'],
    scopes: ['channels:history', 'groups:history', 'im:history', 'mpim:history'],
  },
  {
    id: 'discord',
    name: 'Discord',
    env: ['DISCORD_CLIENT_ID', 'DISCORD_CLIENT_SECRET', 'NEXT_PUBLIC_SITE_URL', 'TOKEN_ENCRYPTION_KEY'],
    scopes: ['identify', 'email'],
  },
  {
    id: 'twitter',
    name: 'Twitter (X)',
    env: ['TWITTER_API_KEY', 'TWITTER_API_SECRET', 'TOKEN_ENCRYPTION_KEY'],
    scopes: ['tweet.read', 'users.read'],
  },
  {
    id: 'dropbox',
    name: 'Dropbox',
    env: ['DROPBOX_CLIENT_ID', 'DROPBOX_CLIENT_SECRET', 'TOKEN_ENCRYPTION_KEY'],
    scopes: ['files.metadata.read'],
  },
  {
    id: 'asana',
    name: 'Asana',
    env: ['ASANA_CLIENT_ID', 'ASANA_CLIENT_SECRET', 'TOKEN_ENCRYPTION_KEY'],
    scopes: ['default'],
  },
  {
    id: 'trello',
    name: 'Trello',
    env: ['TRELLO_API_KEY', 'TRELLO_TOKEN', 'TOKEN_ENCRYPTION_KEY'],
    scopes: ['read'],
  },
  {
    id: 'linear',
    name: 'Linear',
    env: ['LINEAR_CLIENT_ID', 'LINEAR_CLIENT_SECRET', 'TOKEN_ENCRYPTION_KEY'],
    scopes: ['read'],
  },
  {
    id: 'clickup',
    name: 'ClickUp',
    env: ['CLICKUP_CLIENT_ID', 'CLICKUP_CLIENT_SECRET', 'TOKEN_ENCRYPTION_KEY'],
    scopes: ['read'],
  },
  {
    id: 'vercel',
    name: 'Vercel',
    env: ['VERCEL_API_TOKEN'],
    scopes: ['read'],
  },
  {
    id: 'netlify',
    name: 'Netlify',
    env: ['NETLIFY_CLIENT_ID', 'NETLIFY_CLIENT_SECRET'],
    scopes: ['read'],
  },
  {
    id: 'supabase',
    name: 'Supabase',
    env: ['SUPABASE_SERVICE_ROLE_KEY', 'NEXT_PUBLIC_SUPABASE_URL'],
    scopes: ['read'],
  },
  {
    id: 'sentry',
    name: 'Sentry',
    env: ['SENTRY_CLIENT_ID', 'SENTRY_CLIENT_SECRET'],
    scopes: ['event:read', 'project:read'],
  },
  {
    id: 'posthog',
    name: 'PostHog',
    env: ['POSTHOG_API_KEY'],
    scopes: ['read'],
  },
  {
    id: 'webflow',
    name: 'Webflow',
    env: ['WEBFLOW_CLIENT_ID', 'WEBFLOW_CLIENT_SECRET'],
    scopes: ['read'],
  },
  {
    id: 'devin',
    name: 'Devin',
    env: ['DEVIN_API_KEY'],
    scopes: ['read'],
  },
  {
    id: 'cursor',
    name: 'Cursor',
    env: ['CURSOR_SESSION_TOKEN'],
    scopes: ['read'],
  },
  {
    id: 'canva',
    name: 'Canva',
    env: ['CANVA_CLIENT_ID', 'CANVA_CLIENT_SECRET'],
    scopes: ['read'],
  },
  {
    id: 'strava',
    name: 'Strava',
    env: ['STRAVA_CLIENT_ID', 'STRAVA_CLIENT_SECRET'],
    scopes: ['activity:read'],
  },
  {
    id: 'fitbit',
    name: 'Fitbit',
    env: ['FITBIT_CLIENT_ID', 'FITBIT_CLIENT_SECRET'],
    scopes: ['activity', 'heartrate'],
  },
  {
    id: 'withings',
    name: 'Withings',
    env: ['WITHINGS_CLIENT_ID', 'WITHINGS_CLIENT_SECRET'],
    scopes: ['user.metrics'],
  },
  {
    id: 'sonos',
    name: 'Sonos',
    env: ['SONOS_CLIENT_ID', 'SONOS_CLIENT_SECRET'],
    scopes: ['playback-control-all'],
  },
  {
    id: 'philips-hue',
    name: 'Philips Hue',
    env: ['HUE_BRIDGE_IP', 'HUE_USER_TOKEN'],
    scopes: ['read'],
  },
  {
    id: 'gcp',
    name: 'Google Cloud Platform',
    env: ['GCP_CLIENT_ID'],
    scopes: ['cloud-platform.read-only'],
  },
  {
    id: 'xero',
    name: 'Xero',
    env: ['XERO_CLIENT_ID'],
    scopes: ['accounting.transactions', 'accounting.reports.read'],
  },
  {
    id: 'figma',
    name: 'Figma',
    env: ['FIGMA_API_TOKEN'],
    scopes: ['file_read'],
  },
  {
    id: 'jira',
    name: 'Jira',
    env: ['JIRA_CLIENT_ID', 'JIRA_CLIENT_SECRET'],
    scopes: ['read:jira-work'],
  },
  {
    id: 'quickbooks',
    name: 'QuickBooks',
    env: ['QUICKBOOKS_CLIENT_ID', 'QUICKBOOKS_CLIENT_SECRET'],
    scopes: ['com.intuit.quickbooks.accounting'],
  },
  {
    id: 'monday',
    name: 'Monday.com',
    env: ['MONDAY_CLIENT_ID', 'MONDAY_CLIENT_SECRET'],
    scopes: ['boards:read', 'workspaces:read'],
  },
  {
    id: 'mixpanel',
    name: 'Mixpanel',
    env: ['MIXPANEL_CLIENT_ID', 'MIXPANEL_CLIENT_SECRET'],
    scopes: ['data:read'],
  },
];


/**
 * Helper to map between Frontend IDs (hyphenated) and Database IDs (underscored)
 */
const platformMappings: Record<string, string> = {
  'google-calendar': 'google_calendar',
  'google-gmail': 'gmail', // handle legacy or variations
  'twitter': 'twitter',
};

const toDbPlatform = (id: string) => platformMappings[id] || id.replace(/-/g, '_');
const fromDbPlatform = (dbPlatform: string) => {
  for (const [id, dbId] of Object.entries(platformMappings)) {
    if (dbId === dbPlatform) return id;
  }
  return dbPlatform.replace(/_/g, '-');
};

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: authData } = await supabase.auth.getUser();
    const user = authData.user;

    if (!user) {
      return NextResponse.json({ platforms: [] }, { status: 200 });
    }

    // Fetch both OAuth tokens and Sync Status in parallel
    const [{ data: tokens }, { data: syncRows }] = await Promise.all([
      supabase.from('oauth_tokens').select('platform').eq('user_id', user.id),
      supabase.from('sync_status').select('platform, status, sync_progress, total_items, last_sync_at, error_message').eq('user_id', user.id),
    ]);

    const tokenPlatforms = new Set((tokens || []).map(t => t.platform));
    const syncMap = new Map((syncRows || []).map(s => [s.platform, s]));

    console.log(`[Readiness] Loading state for user ${user.id}. Found ${tokenPlatforms.size} tokens and ${syncMap.size} sync records.`);

    const platforms: PlatformReadiness[] = platformConfigs.map((cfg) => {
      const dbId = toDbPlatform(cfg.id);
      const sync = syncMap.get(dbId);
      const hasToken = tokenPlatforms.has(dbId);
      
      const status = (sync?.status ?? 'idle') as PlatformReadiness['status'];
      
      // A platform is connected if we have a token OR it has ever attempted a sync
      const connected = hasToken || ['connected', 'syncing', 'authenticating', 'connecting', 'error'].includes(status);

      const missingEnv = cfg.env.filter((key) => !process.env[key]);
      const configured = missingEnv.length === 0;

      return {
        id: cfg.id,
        name: cfg.name,
        connectionType: cfg.env.some(e => e.includes('TOKEN') || e.includes('KEY')) ? 'APIKey' : 'OAuth',
        requiredScopes: cfg.scopes,
        optional: Boolean(cfg.optional),
        deferred: Boolean(cfg.optional && !configured),
        configured,
        missingEnv,
        connected,
        status,
        syncProgress: sync?.sync_progress ?? 0,
        items: sync?.total_items ?? 0,
        lastSyncAt: sync?.last_sync_at ?? null,
        errorMessage: sync?.error_message ?? null,
      };
    });

    return NextResponse.json({ platforms }, { status: 200 });
  } catch (error) {
    console.error('[Readiness] API Fatal Error:', error);
    return NextResponse.json({ platforms: [], error: 'Internal Server Error' }, { status: 500 });
  }
}
