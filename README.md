# Qwency (MVP)

One tap a day. Monthly = direction, weekly = awareness, daily = reality, reasons = truth.

Stack: Next.js 16 (App Router) · Clerk (auth) · Supabase (Postgres) · Tailwind v4.

## Setup

1. `npm install`
2. Clerk: create an app, put its keys in `.env`.
3. Supabase: create a project, put `NEXT_PUBLIC_SUPABASE_URL` and
   `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` in `.env`.
4. Connect the two (one-time):
   - Clerk Dashboard -> Integrations -> Supabase -> activate, copy the Clerk domain.
   - Supabase Dashboard -> Authentication -> Sign In / Providers -> Third-Party Auth -> Add Clerk -> paste the domain.
5. Supabase **SQL Editor**: run `supabase/schema.sql`.
6. `npm run dev` -> http://localhost:3000

Supabase is called from the server with the publishable key plus the user's Clerk token;
RLS policies restrict every row to its owner.

## What a day tracks is data, not code

`supabase/schema.sql` added a `habit_specs` table: one JSON "spec" per user describing their
sections and questions (see `src/lib/spec.ts` for the shape, `DEFAULT_SPEC` for the seed —
currently Kush's own setup). Every new user gets that seed on first visit; from then on it's
theirs, edited from the **Setup** tab, with no code change and no migration. The overall
verdict (Good/Okay/Rough), reasons and note stay fixed for every user, so patterns stay
comparable across a personalized set of trackers.

If you already ran an older `schema.sql`, just run the new one again — it only adds the
`habit_specs` table and is safe to re-run.

## Schedules: what "missed" means

Each section has `days` (0 = Mon … 6 = Sun): when it's *expected*. Everything on the Patterns
page is measured against that plan (`src/lib/mirror.ts`): **Reality** (done), **Gap** (a
bad-toned answer, or nothing logged on a planned day) and **Reason** (reason chips, the answer
to a dedicated follow-up like "What stopped you?", or a note). A day only counts if it's
scheduled, on or after your first logged day, on or after the section's `since` date, and not
today (today's unanswered sections are "open").

Specs saved before schedules existed had `weekendDefaults`; `sanitizeSpec` reads them once and
turns any section that had a weekend default into weekdays-only.
