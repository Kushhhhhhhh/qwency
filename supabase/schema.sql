-- Run this once in Supabase: SQL Editor -> New query -> paste -> Run. Safe to re-run.
-- Ownership is the Clerk user id (the `sub` claim of the Clerk session token).
-- Requires the Clerk <-> Supabase integration (see README).
--
-- One row per user per day.
--   mood / tags / note : the overall verdict and why
--   data               : everything else you track (sleep, work, gym, water, skin,
--                        spending...) as JSON, so new trackers need no migration.

create table if not exists public.day_entries (
  user_id     text        not null,
  entry_date  date        not null,
  mood        text        check (mood in ('good', 'meh', 'bad')),
  tags        text[]      not null default '{}',
  note        text        not null default '',
  data        jsonb       not null default '{}'::jsonb,
  updated_at  timestamptz not null default now(),
  primary key (user_id, entry_date)
);

-- in case an earlier version of this table exists
alter table public.day_entries add column if not exists data jsonb not null default '{}'::jsonb;
alter table public.day_entries alter column mood drop not null;

create table if not exists public.month_focus (
  user_id  text not null,
  month    text not null check (month ~ '^\d{4}-\d{2}$'),
  focus    text not null default '',
  primary key (user_id, month)
);

alter table public.day_entries enable row level security;
alter table public.month_focus enable row level security;

-- Each signed-in user can only touch their own rows.
drop policy if exists "own rows" on public.day_entries;
create policy "own rows" on public.day_entries
  for all to authenticated
  using ((select auth.jwt() ->> 'sub') = user_id)
  with check ((select auth.jwt() ->> 'sub') = user_id);

drop policy if exists "own rows" on public.month_focus;
create policy "own rows" on public.month_focus
  for all to authenticated
  using ((select auth.jwt() ->> 'sub') = user_id)
  with check ((select auth.jwt() ->> 'sub') = user_id);
