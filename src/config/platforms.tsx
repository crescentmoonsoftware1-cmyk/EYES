import { 
  GitHubIconOfficial, 
  GmailIconOfficial, 
  CalendarIconOfficial, 
  NotionIconOfficial, 
  SlackIconOfficial, 
  DiscordIconOfficial,
  AsanaIconOfficial,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  TrelloIconOfficial,
  LinearIconOfficial,
  ClickUpIconOfficial,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  VercelIconOfficial,
  NetlifyIconOfficial,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  SupabaseIconOfficial,
  SentryIconOfficial,
  WebflowIconOfficial,
  CursorIconOfficial,
  CanvaIconOfficial,
  DropboxIconOfficial,
  XIconOfficial,
  StravaIconOfficial,
  FitbitIconOfficial,
  WithingsIconOfficial,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  RedditIconOfficial,
  LinkedInIconOfficial,
  GoogleDocsIcon,
  GoogleSheetsIcon,
  GoogleSlidesIcon,
  GoogleMeetIcon,
  GoogleChatIcon,
  GoogleMapsIcon,
  YouTubeIconOfficial
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

  // ─── Development ──────────────────────────────────────────────────────────
  { id: 'github',          name: 'GitHub',          icon: <GitHubIconOfficial />,   category: 'Development',  description: 'Sync repositories, pull requests, and code history.',       color: 'var(--text-primary)' },
  { id: 'netlify',         name: 'Netlify',         icon: <NetlifyIconOfficial />,  category: 'Development',  description: 'Monitor site deployments and build history.',               color: '#05BDBA', comingSoon: true },
  { id: 'sentry',          name: 'Sentry',          icon: <SentryIconOfficial />,   category: 'Development',  description: 'Monitor error logs and application health.',                color: '#362D59', comingSoon: true },
  { id: 'webflow',         name: 'Webflow',         icon: <WebflowIconOfficial />,  category: 'Development',  description: 'Sync site settings, forms, and CMS data.',                 color: '#4353FF', comingSoon: true },

  // ─── Social ───────────────────────────────────────────────────────────────
  { id: 'discord',         name: 'Discord',         icon: <DiscordIconOfficial />,  category: 'Social',       description: 'Connect servers and private messaging history.',            color: '#5865f2' },
  { id: 'twitter',         name: 'Twitter (X)',     icon: <XIconOfficial />,        category: 'Social',       description: 'Sync your tweets, mentions, and social footprint.',         color: 'var(--text-primary)' },
  // { id: 'reddit',          name: 'Reddit',          icon: <RedditIconOfficial />,   category: 'Social',       description: 'Index your posts, comments, and saved content.',            color: '#FF4500', comingSoon: true },


  // ─── Creative ─────────────────────────────────────────────────────────────
  { id: 'canva',           name: 'Canva',           icon: <CanvaIconOfficial />,    category: 'Creative',     description: 'Sync your Canva designs and creative projects.',            color: '#00C4CC', comingSoon: true },

  // ─── Health & Fitness ─────────────────────────────────────────────────────
  { id: 'strava',          name: 'Strava',          icon: <StravaIconOfficial />,   category: 'Health',       description: 'Index running, cycling, and athletic activities.',         color: '#FC4C02', comingSoon: true },
  { id: 'fitbit',          name: 'Fitbit',          icon: <FitbitIconOfficial />,   category: 'Health',       description: 'Track fitness activities, sleep, and health metrics.',     color: '#00B0B9', comingSoon: true },
  { id: 'withings',        name: 'Withings',        icon: <WithingsIconOfficial />, category: 'Health',       description: 'Connect health and wellness device metrics.',              color: '#00A8A8', comingSoon: true },

  // ─── Missing Nodes ────────────────────────────────────────────────────────
  { id: 'cursor',          name: 'Cursor',          icon: <CursorIconOfficial />,   category: 'Development',  description: 'Sync your AI-assisted code evolution history.',            color: 'var(--text-primary)', comingSoon: true },
  { id: 'linkedin',        name: 'LinkedIn',        icon: <LinkedInIconOfficial />, category: 'Social',       description: 'Index professional networking and careers communications.', color: '#0077b5', comingSoon: true },

  // ─── Workspace & Maps ───────────────────────────────────────────
  { id: 'google-docs',     name: 'Google Docs',     icon: <GoogleDocsIcon />,       category: 'Productivity', description: 'Read documents, generate reports, and meeting notes.',       color: '#4285F4' },
  { id: 'google-sheets',   name: 'Google Sheets',   icon: <GoogleSheetsIcon />,     category: 'Productivity', description: 'Sync personal data, habits, expenses, and analytics.',       color: '#0F9D58' },
  { id: 'google-slides',   name: 'Google Slides',   icon: <GoogleSlidesIcon />,     category: 'Productivity', description: 'Index presentation generation and AI-created reports.',      color: '#F4B400' },
  { id: 'google-meet',     name: 'Google Meet',     icon: <GoogleMeetIcon />,       category: 'Productivity', description: 'Sync meeting data and AI-generated meeting summaries.',      color: '#00832d' },
  { id: 'google-chat',     name: 'Google Chat',     icon: <GoogleChatIcon />,       category: 'Productivity', description: 'Index team communication and perform message analysis.',     color: '#00ac47' },
  { id: 'google-maps',     name: 'Google Maps',     icon: <GoogleMapsIcon />,       category: 'Social',       description: 'Save travel memories, places, and location insights.',       color: '#4285F4' },

  { id: 'youtube',         name: 'YouTube',         icon: <YouTubeIconOfficial />,  category: 'Creative',     description: 'Index saved videos, watch history, and learning.',           color: '#FF0000' },
];
