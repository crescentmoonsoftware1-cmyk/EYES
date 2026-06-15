# The EYES

The EYES is a Next.js dashboard for exploring personal digital memory data across connected platforms. (Everything You Ever Said)

## Tech Stack

- Next.js 16 (App Router)
- React 19
- TypeScript 5
- ESLint 9 with `eslint-config-next`

## Run Locally

```bash
npm install
npm run dev
```

Open <http://localhost:3000>.

## Scripts

- `npm run dev`: Start local development server
- `npm run build`: Build production bundle
- `npm run start`: Start production server
- `npm run lint`: Run lint checks

## Project Layout

- `src/app/page.tsx`: Main shell composition
- `src/components/*`: Dashboard UI components
- `src/app/api/audit-summary/route.ts`: Audit summary API
- `src/app/api/memory-chat/route.ts`: Chat API endpoint
- `src/types/dashboard.ts`: Shared dashboard API and UI types

## Notes

- Dashboard content is API-backed through local route handlers.
- The UI supports desktop and mobile layouts with responsive CSS modules.

## Unattended Sync

- Cron route: `/api/cron/sync`
- Schedule: configured in `vercel.json` (every 30 minutes)
- Required server env vars: `CRON_SECRET`, `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_SITE_URL`
- Optional escalation env vars: `SYNC_ESCALATION_WEBHOOK_URL`, `SYNC_ESCALATION_COOLDOWN_MINUTES`, `SYNC_ESCALATION_OWNER_WARNING`, `SYNC_ESCALATION_OWNER_CRITICAL`, `SYNC_ESCALATION_INCLUDE_WARNING`

## Linear Setup

Linear actions now execute directly from the Action Queue and Linear sync is available in the platform stack.

Required env vars:

- `LINEAR_CLIENT_ID`
- `LINEAR_CLIENT_SECRET`
- `LINEAR_DEFAULT_TEAM_ID` (used when creating tickets from the Action Queue)
- `TOKEN_ENCRYPTION_KEY`

If you want the platform readiness screen to show Linear as configured, all of the above must be present.

## EYES Gateway Setup

Core LLM operations are routed through a single OpenAI-compatible AI gateway.

Required env vars:

- `LITELLM_BASE_URL` (usually set to `https://eyes-llm-gateway.fly.dev/v1`)
- `LITELLM_KEY` (the master key or project virtual key)

