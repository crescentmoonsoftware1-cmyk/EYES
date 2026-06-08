# Supabase Setup Instructions

## ✅ Current Repository State

1. **Supabase auth is wired into the app**:
   - Login/signup uses Supabase Authentication
   - User profiles persist in `user_profiles` (not localStorage)
   - Session is restored on reload

2. **Core database schema exists in migrations**:
   - `supabase/migrations/001_initial_schema.sql`
   - `supabase/migrations/002_enforce_upsert_constraints.sql`
   - `supabase/migrations/003_data_lifecycle_rls_policies.sql`
   - `supabase/migrations/004_enable_realtime_publication.sql`
   - `supabase/migrations/005_sync_run_logs.sql`
   - `supabase/migrations/006_sync_retry_queue.sql`
   - `supabase/migrations/007_sync_retry_dead_letters.sql`
   - `supabase/migrations/008_sync_escalation_events.sql`
   - `supabase/migrations/009_oauth_refresh_logs.sql`
   - `supabase/migrations/010_provider_disconnect_audits.sql`
   - `supabase/migrations/011_connector_settings.sql`

3. **Primary tables are already modeled**:
   - `user_profiles`: User metadata
   - `oauth_tokens`: Connected platform credentials
   - `sync_status`: Per-platform sync status and errors
   - `raw_events`: Imported platform events
   - `embeddings`: Vector rows for retrieval
   - `topics`: Topic metadata table
   - `oauth_refresh_logs`: OAuth refresh reliability telemetry
   - `provider_disconnect_audits`: provider revoke + lifecycle deletion audit ledger
   - `connector_settings`: per-connector data type + auto-sync preferences

4. **AI runtime is OpenAI-based**:
   - Embeddings: `text-embedding-3-small`
   - Chat: `gpt-4o`

5. **RLS is enabled** on core tables, including lifecycle delete policies in migration `003`.

## 🔧 Next Steps

### 1. **Apply Database Migrations (in order)**

Go to your Supabase Dashboard:

1. Open [Supabase Dashboard](https://app.supabase.com)
2. Select your project: **lwxkkyqfulrvlqoitglp**
3. Go to **SQL Editor** in the left sidebar
4. Click **New Query**
5. Run `supabase/migrations/001_initial_schema.sql`
6. Run `supabase/migrations/002_enforce_upsert_constraints.sql`
7. Run `supabase/migrations/003_data_lifecycle_rls_policies.sql`
8. Run `supabase/migrations/004_enable_realtime_publication.sql`
9. Run `supabase/migrations/005_sync_run_logs.sql`
10. Run `supabase/migrations/006_sync_retry_queue.sql`
11. Run `supabase/migrations/007_sync_retry_dead_letters.sql`
12. Run `supabase/migrations/008_sync_escalation_events.sql`
13. Run `supabase/migrations/009_oauth_refresh_logs.sql`
14. Run `supabase/migrations/010_provider_disconnect_audits.sql`
15. Run `supabase/migrations/011_connector_settings.sql`

This creates core tables, RLS policies, and required upsert constraints.

### 2. **Create Vector Search RPC Function**

Run `SUPABASE_VECTOR_SEARCH.sql` in the same SQL Editor.

This creates `match_memories(...)` and `hybrid_search(...)`, which power memory retrieval in chat. Note: `match_embeddings` was dropped in migration 030 and replaced by `match_memories`.

### 3. **Ensure `vector` Extension Is Available**

In the SQL Editor, verify the extension first:

```sql
SELECT extname
FROM pg_extension
WHERE extname = 'vector';
```

If no row is returned, run:

```sql
CREATE EXTENSION IF NOT EXISTS vector;
```

Migration `001` already requests this extension, so most setups will already have it.

### 4. **Test the Connection**

Run the app locally:

```bash
npm run dev
```

Then:

1. Go to <http://localhost:3000>
2. Click **Sign up**
3. Create a test account
4. You should be logged in and redirected to the dashboard

The app will automatically create your `user_profiles` entry on first signup.

### 5. **Verify in Supabase**

After signup, check your database:

1. Go to **Supabase Dashboard → SQL Editor**
2. Run: `SELECT * FROM user_profiles;`
3. You should see your new user profile

Then verify vector search function exists:

```sql
SELECT proname
FROM pg_proc
WHERE proname IN ('match_memories', 'hybrid_search');
```

You should get two rows: `match_memories` and `hybrid_search`.

### 6. **Configure Unattended Scheduler**

The repository now includes unattended sync orchestration:

- Cron entrypoint: `/api/cron/sync`
- Dead-letter remediation entrypoint: `/api/cron/retry-remediation`
- Schedule config: `vercel.json` (`/api/cron/sync` every 30 minutes, `/api/cron/retry-remediation` every 6 hours)

Required server environment variables:

- `CRON_SECRET`: shared secret used to authorize cron calls
- `SUPABASE_SERVICE_ROLE_KEY`: required for service-role cron execution
- `NEXT_PUBLIC_SITE_URL`: used for internal callback URL resolution in cron fan-out

Optional tuning variables:

- `CRON_MAX_USERS_PER_RUN` (default `10`)
- `CRON_USER_CONCURRENCY` (default `3`)
- `CRON_PLATFORM_CONCURRENCY` (default `2`)
- `CRON_SYNC_TIMEOUT_MS` (default `20000`)
- `CRON_EMBEDDINGS_TIMEOUT_MS` (default `25000`)
- `CRON_RETRY_BASE_DELAY_MS` (default `60000`)
- `CRON_RETRY_MAX_DELAY_MS` (default `3600000`)
- `CRON_RETRY_MAX_ATTEMPTS` (default `4`)
- `CRON_RETRY_DUE_LIMIT` (default `100`)
- `CRON_RETRY_JITTER_RATIO` (default `0.2`)
- `CRON_REMEDIATION_MAX_PER_RUN` (default `50`)
- `CRON_REMEDIATION_PURGE_OLDER_THAN_HOURS` (default `336`)
- `SYNC_ALERT_PENDING_RETRY_THRESHOLD` (default `8`)
- `SYNC_ALERT_DEAD_LETTER_24H_THRESHOLD` (default `3`)
- `SYNC_ALERT_MAX_RETRY_ATTEMPT_THRESHOLD` (default `3`)
- `SYNC_ALERT_FAILURE_RATE_24H_THRESHOLD` (default `0.25`)
- `SYNC_ESCALATION_WEBHOOK_URL` (optional, outbound escalation destination)
- `SYNC_ESCALATION_COOLDOWN_MINUTES` (default `60`)
- `SYNC_ESCALATION_OWNER_WARNING` (default `ops-review`)
- `SYNC_ESCALATION_OWNER_CRITICAL` (default `ops-oncall`)
- `SYNC_ESCALATION_INCLUDE_WARNING` (default `false`, dispatch warning-level incidents)
- `GOOGLE_REFRESH_MAX_ATTEMPTS` (default `3`)
- `GOOGLE_REFRESH_BASE_DELAY_MS` (default `400`)
- `GOOGLE_REFRESH_MAX_DELAY_MS` (default `5000`)
- `GOOGLE_REFRESH_JITTER_RATIO` (default `0.2`)

Manual smoke test (with secret):

```bash
curl -H "Authorization: Bearer <CRON_SECRET>" \
   "http://localhost:3000/api/cron/sync?maxUsers=1"
```

Expected result: JSON summary with `ok: true` and run counts.

Dead-letter replay smoke test (with secret):

```bash
curl -H "Authorization: Bearer <CRON_SECRET>" \
   "http://localhost:3000/api/cron/retry-remediation?dryRun=1"
```

Expected result: JSON summary with `action: "requeue"` and candidate counts.

---

## 📋 Database Schema Overview

| Table | Purpose | Key Fields |
| ----- | ------- | ---------- |
| `user_profiles` | User account info | user_id, name, avatar, plan, memories_indexed |
| `oauth_tokens` | Platform credentials | user_id, platform, access_token, refresh_token |
| `sync_status` | Sync progress tracking | user_id, platform, last_sync_at, status |
| `raw_events` | Imported data | user_id, platform, content, timestamp, is_flagged |
| `embeddings` | Vector embeddings | user_id, event_id, embedding (pgvector) |
| `topics` | Clustered topics | user_id, title, event_ids, sentiment |

---

## 🔐 Security Notes

- **RLS Enabled**: Users can only access their own data
- **Auth-only access**: All tables require authentication
- **Anonymous key**: Used only for real-time subscriptions and limited reads
- **Service role key**: Needed for cron/admin operations (store in server-only environment variables)

---

## ⚠️ Important

- **DO NOT** commit `.env.local` to git (add to `.gitignore` if not already)
- Keep your `NEXT_PUBLIC_SUPABASE_ANON_KEY` safe
- Set `SUPABASE_SERVICE_ROLE_KEY` for cron/admin sync execution
- Set `CRON_SECRET` before enabling scheduler invocations
- Set `OPENAI_API_KEY` for embeddings/chat to work
- Set `TOKEN_ENCRYPTION_KEY` to encrypt stored OAuth tokens at rest

## Current Gaps (As Of 2026-04-08)

These are still pending in the current repository:

1. **Operational runbook depth**: Unattended cron, persistent run logs, retry queue/backoff, dead-letter handling, remediation replay/purge, escalation routing, and 30-day analytics are implemented. Remaining gap is richer incident runbook linkage and report export.
2. **Telemetry packaging**: OAuth refresh and sync analytics are surfaced via `/api/sync/analytics` and dashboard trend cards. Remaining gap is long-horizon export packaging (ZIP/report snapshots).
3. **Integration coverage**: Unit and route-level tests are present, but full end-to-end browser flows (connect -> sync -> embeddings -> chat) are still missing.
