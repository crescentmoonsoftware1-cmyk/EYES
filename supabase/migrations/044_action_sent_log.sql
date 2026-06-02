-- ============================================================
-- EYES: action_sent_log (Immutable log for sent replies)
-- ============================================================

create table if not exists public.action_sent_log (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  action_id       uuid references public.action_queue(id) on delete set null,
  platform        text not null,
  recipient       text not null,
  subject         text,
  body            text not null,
  sent_at         timestamptz not null default now()
);

-- Index for analytics and auditing
create index if not exists idx_action_sent_log_user
  on public.action_sent_log(user_id, sent_at desc);

-- RLS: Read own, No updates or deletes (immutable)
alter table public.action_sent_log enable row level security;

create policy "Users select own sent logs"
  on public.action_sent_log for select
  using (auth.uid() = user_id);

create policy "Users insert own sent logs"
  on public.action_sent_log for insert
  with check (auth.uid() = user_id);

create policy "Service role full access sent logs"
  on public.action_sent_log for all
  using (true)
  with check (true);
