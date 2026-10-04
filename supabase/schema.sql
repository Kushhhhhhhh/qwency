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

-- A month's direction beyond the focus line: its goals and its end-of-month review, as JSON
-- ({ goals: [...], review?: {...} }). One column, no new table; safe to re-run.
alter table public.month_focus add column if not exists plan jsonb not null default '{}'::jsonb;

-- One personalized spec per user: which sections/questions their day tracks, and their
-- weekend defaults. Seeded from the app's DEFAULT_SPEC on first visit, then editable in Setup.
create table if not exists public.habit_specs (
  user_id    text primary key,
  spec       jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.day_entries enable row level security;
alter table public.month_focus enable row level security;
alter table public.habit_specs enable row level security;

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

drop policy if exists "own rows" on public.habit_specs;
create policy "own rows" on public.habit_specs
  for all to authenticated
  using ((select auth.jwt() ->> 'sub') = user_id)
  with check ((select auth.jwt() ->> 'sub') = user_id);

-- ---------------------------------------------------------------------------------------------
-- Shop: a monthly "pocket" (budget) and the things you actually need. Safe to re-run.
--
-- A month's pocket lives on the month's existing row (month_focus), next to its focus line and goals.
alter table public.month_focus add column if not exists budget numeric(12, 2);

-- One row per thing, so editing one never rewrites the others and offline edits merge cleanly.
--   shelf: month = planned this month, window = saved to look at later, bought = a receipt, skipped = decided against
--   icon:  one of the app's shopping icons (no pictures are stored)
create table if not exists public.shop_items (
  user_id      text          not null,
  id           uuid          not null,
  month        text          not null check (month ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  title        text          not null,
  price        numeric(12, 2),
  url          text          not null default '',
  note         text          not null default '',
  icon         text          not null default 'bag',
  kind         text          not null default 'need' check (kind in ('need', 'want')),
  shelf        text          not null default 'month' check (shelf in ('month', 'window', 'bought', 'skipped')),
  bought_price numeric(12, 2),
  bought_on    date,
  sort         integer       not null default 0,
  created_at   timestamptz   not null default now(),
  updated_at   timestamptz   not null default now(),
  primary key (user_id, id)
);

create index if not exists shop_items_user_month on public.shop_items (user_id, month);

alter table public.shop_items enable row level security;

drop policy if exists "own rows" on public.shop_items;
create policy "own rows" on public.shop_items
  for all to authenticated
  using ((select auth.jwt() ->> 'sub') = user_id)
  with check ((select auth.jwt() ->> 'sub') = user_id);
