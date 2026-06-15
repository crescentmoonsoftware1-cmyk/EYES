-- Section 05: Insights table
-- Schema: id, user_id, kind, title, body, citations[], strength, computed_at, is_current
-- Written by the nightly job; read by the retrieval step when need_insights=true.
-- Also feeds the Proactive Observations surface.

create type insight_kind as enum ('theme', 'loop', 'drift', 'entity_link', 'observation');

create table if not exists public.insights (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  kind         insight_kind not null,
  title        text not null,
  body         text not null,
  citations    text[] not null default '{}',   -- record IDs from the memories table
  strength     numeric(4,3) not null default 0 check (strength >= 0 and strength <= 1),
  computed_at  timestamptz not null default now(),
  is_current   boolean not null default true,
  created_at   timestamptz not null default now()
);

-- Index for retrieval: current insights per user, ordered by strength
create index if not exists insights_user_current_idx
  on public.insights (user_id, is_current, strength desc);

-- Index for kind-based filtering
create index if not exists insights_kind_idx
  on public.insights (user_id, kind, is_current);

-- RLS: users can only read their own insights
alter table public.insights enable row level security;

create policy "Users can read own insights"
  on public.insights for select
  using (auth.uid() = user_id);

-- Service role can write (nightly job uses service key)
create policy "Service role can manage insights"
  on public.insights for all
  using (true)
  with check (true);

-- Add summary column to chat_threads (for rolling conversation summary — Section 04)
alter table public.chat_threads
  add column if not exists summary text;

-- Add stage column to reputation_audits (for Thinking Veil — Section 06)
alter table public.reputation_audits
  add column if not exists stage text not null default 'pending';

-- Add stripe_session_id column to reputation_audits (for K5 idempotency)
alter table public.reputation_audits
  add column if not exists stripe_session_id text unique;

create index if not exists audits_stripe_session_idx
  on public.reputation_audits (stripe_session_id)
  where stripe_session_id is not null;
