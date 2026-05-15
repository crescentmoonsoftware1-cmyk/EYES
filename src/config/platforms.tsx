import { 
  GitHubIconOfficial, 
  GmailIconOfficial, 
  CalendarIconOfficial, 
  NotionIconOfficial, 
  SlackIconOfficial, 
  DiscordIconOfficial,
  AsanaIconOfficial,
  TrelloIconOfficial,
  LinearIconOfficial,
  ClickUpIconOfficial,
  VercelIconOfficial,
  NetlifyIconOfficial,
  SupabaseIconOfficial,
  SentryIconOfficial,
  PostHogIconOfficial,
  WebflowIconOfficial,
  DevinIconOfficial,
  CursorIconOfficial,
  CanvaIconOfficial,
  DropboxIconOfficial,
  XIconOfficial,
  StravaIconOfficial,
  FitbitIconOfficial,
  WithingsIconOfficial,
  RedditIconOfficial,
  LinkedInIconOfficial
} from '../components/common/icons/PlatformIcons';

export const ALL_POSSIBLE_PLATFORMS = [
  // ─── Productivity ─────────────────────────────────────────────────────────
  { id: 'gmail',           name: 'Gmail',           icon: <GmailIconOfficial />,    category: 'Productivity', description: 'Index your entire email history and communications.',       color: '#ea4335' },
  { id: 'google-calendar', name: 'Google Calendar', icon: <CalendarIconOfficial />, category: 'Productivity', description: 'Track your meetings, events, and time allocation.',          color: '#4285f4' },
  { id: 'notion',          name: 'Notion',          icon: <NotionIconOfficial />,   category: 'Productivity', description: 'Search through your pages, databases, and workspace.',       color: 'var(--text-primary)' },
  { id: 'slack',           name: 'Slack',           icon: <SlackIconOfficial />,    category: 'Productivity', description: 'Index channel messages and direct communications.',          color: '#e01e5a' },
  { id: 'dropbox',         name: 'Dropbox',         icon: <DropboxIconOfficial />,  category: 'Productivity', description: 'Search and index your cloud files and metadata.',            color: '#0061ff' },
  { id: 'asana',           name: 'Asana',           icon: <AsanaIconOfficial />,    category: 'Productivity', description: 'Track project tasks, goals, and team progress.',             color: '#F95D5C' },
  { id: 'linear',          name: 'Linear',          icon: <LinearIconOfficial />,   category: 'Productivity', description: 'Sync engineering tickets, cycles, and roadmaps.',           color: '#5E6AD2' },
  { id: 'clickup',         name: 'ClickUp',         icon: <ClickUpIconOfficial />,  category: 'Productivity', description: 'Connect your all-in-one productivity workspace.',            color: '#7B68EE' },
  { id: 'trello',          name: 'Trello',          icon: <TrelloIconOfficial />,   category: 'Productivity', description: 'Index boards, cards, and workflow history.',                 color: '#0079BF', apiKeyOnly: true },

  // ─── Development ──────────────────────────────────────────────────────────
  { id: 'github',          name: 'GitHub',          icon: <GitHubIconOfficial />,   category: 'Development',  description: 'Sync repositories, pull requests, and code history.',       color: 'var(--text-primary)' },
  { id: 'vercel',          name: 'Vercel',          icon: <VercelIconOfficial />,   category: 'Development',  description: 'Track deployments, logs, and project health.',              color: 'var(--text-primary)', apiKeyOnly: true },
  { id: 'netlify',         name: 'Netlify',         icon: <NetlifyIconOfficial />,  category: 'Development',  description: 'Monitor site deployments and build history.',               color: '#05BDBA' },
  { id: 'sentry',          name: 'Sentry',          icon: <SentryIconOfficial />,   category: 'Development',  description: 'Monitor error logs and application health.',                color: '#362D59' },
  { id: 'webflow',         name: 'Webflow',         icon: <WebflowIconOfficial />,  category: 'Development',  description: 'Sync site settings, forms, and CMS data.',                 color: '#4353FF' },

  // ─── Social ───────────────────────────────────────────────────────────────
  { id: 'discord',         name: 'Discord',         icon: <DiscordIconOfficial />,  category: 'Social',       description: 'Connect servers and private messaging history.',            color: '#5865f2' },
  { id: 'twitter',         name: 'Twitter (X)',     icon: <XIconOfficial />,        category: 'Social',       description: 'Sync your tweets, mentions, and social footprint.',         color: 'var(--text-primary)' },
  { id: 'reddit',          name: 'Reddit',          icon: <RedditIconOfficial />,   category: 'Social',       description: 'Index your subreddits, comments, and posts.',              color: '#FF4500' },

  // ─── Creative ─────────────────────────────────────────────────────────────
  { id: 'canva',           name: 'Canva',           icon: <CanvaIconOfficial />,    category: 'Creative',     description: 'Sync your Canva designs and creative projects.',            color: '#00C4CC' },

  // ─── Health & Fitness ─────────────────────────────────────────────────────
  { id: 'strava',          name: 'Strava',          icon: <StravaIconOfficial />,   category: 'Health',       description: 'Index running, cycling, and athletic activities.',         color: '#FC4C02' },
  { id: 'fitbit',          name: 'Fitbit',          icon: <FitbitIconOfficial />,   category: 'Health',       description: 'Track fitness activities, sleep, and health metrics.',     color: '#00B0B9' },
  { id: 'withings',        name: 'Withings',        icon: <WithingsIconOfficial />, category: 'Health',       description: 'Connect health and wellness device metrics.',              color: '#00A8A8' },

  // ─── Missing Nodes (Target 26) ───────────────────────────────────────────
  { id: 'supabase',        name: 'Supabase',        icon: <SupabaseIconOfficial />, category: 'Development',  description: 'Monitor your backend databases and auth states.',           color: '#3ECF8E' },
  { id: 'posthog',         name: 'PostHog',         icon: <PostHogIconOfficial />,  category: 'Development',  description: 'Sync user analytics and product data.',                    color: '#F0F0F0' },
  { id: 'devin',           name: 'Devin',           icon: <DevinIconOfficial />,    category: 'Development',  description: 'Monitor autonomous AI engineering agents.',               color: '#1A1A1A' },
  { id: 'cursor',          name: 'Cursor',          icon: <CursorIconOfficial />,   category: 'Development',  description: 'Sync your AI-assisted code evolution history.',            color: 'var(--text-primary)' },
  { id: 'linkedin',        name: 'LinkedIn',        icon: <LinkedInIconOfficial />, category: 'Social',       description: 'Index professional networking and careers communications.', color: '#0077b5' },
];
