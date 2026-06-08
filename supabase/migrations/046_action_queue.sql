-- ============================================================
-- EYES: action_queue table
-- Run this in Supabase SQL Editor (Dashboard → SQL Editor → New Query)
-- ============================================================

create table if not exists public.action_queue (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  memory_id       text,                          -- source memory id (nullable — AI may span multiple)
  platform        text not null,
  title           text not null,
  description     text,
  suggested_action text,
  action_type     text,                          -- CALENDAR | LINEAR_TICKET | SLACK_REPLY | REMINDER | EMAIL_REPLY
  method          text default 'POST',           -- POST | PATCH | DELETE
  confidence      integer default 80,
  status          text not null default 'pending', -- pending | approved | dismissed | executed | failed
  extracted_at    timestamptz not null default now(),
  executed_at     timestamptz,
  created_at      timestamptz not null default now()
);

-- Index for fast pending-action lookups per user
create index if not exists idx_action_queue_user_status
  on public.action_queue(user_id, status, extracted_at desc);

-- RLS: users can only see their own actions
alter table public.action_queue enable row level security;

create policy "Users see own actions"
  on public.action_queue for select
  using (auth.uid() = user_id);

create policy "Users insert own actions"
  on public.action_queue for insert
  with check (auth.uid() = user_id);

create policy "Users update own actions"
  on public.action_queue for update
  using (auth.uid() = user_id);

create policy "Service role full access"
  on public.action_queue for all
  using (true)
  with check (true);

-- Track last extraction time per user (avoids re-running AI if nothing changed)
create table if not exists public.action_extraction_log (
  user_id       uuid primary key references auth.users(id) on delete cascade,
  last_run_at   timestamptz not null default now(),
  memory_count  integer default 0       -- how many memories were visible at last run
);

alter table public.action_extraction_log enable row level security;

create policy "Users manage own extraction log"
  on public.action_extraction_log for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Service role full access extraction log"
  on public.action_extraction_log for all
  using (true)
  with check (true);
