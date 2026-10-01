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

## Targets: what counts as a slip

A gap on Patterns is only as meaningful as the line it's measured against, and every question
can have one (`isSlip` in `src/lib/spec.ts`, the single rule Today, Patterns and the reason
prompt all share):

- **Choice** questions: any option you mark orange ("bad") in Setup. For a scale like sleep
  hours, "good from ▾" sets the whole line in one tap.
- **Counter**: its goal is a floor. Falling short is a slip *once the day is over*; 3/8 glasses at
  noon is on its way, so today shows "still open".
- **Number**: optional "Up to" / "At least". A limit is broken the moment it's crossed.

A section where nothing can slip says so on Patterns ("Set a target") and in Setup ("no target
yet"), since only missed days can show up there. "Why did this slip?" asks at most once per
section. Targets live in the same per-user spec JSON: no new table, nothing to migrate.

## Splitting a number across your picks

A multi-choice that only shows once a number is above zero (Spending's "On what?" after "Spent
today") is that number's breakdown (`breakdownOf` in `src/lib/spec.ts`). Nothing to switch on, so
it applies to every saved spec that already has the pattern. Each pick you choose gets an optional
amount box ("Split it up"), stored as a plain number under `fieldKey__optionId` in the same day
blob. Today says how much of the total is unsplit; Patterns adds "Where it went" for the window.
An amount is dropped when its pick is unticked or the total goes back to zero.

## Staying current (stale tabs, other devices)

The app outlives the day: phones park tabs for hours. Three rules keep that safe:

- **Saves are patches.** A tap sends only the keys it changed (`patchData` in `src/app/actions.ts`,
  `diffData` / `applyPatch` in `src/lib/spec.ts`), merged into whatever the server already has
  for that day. A stale tab or a second device can no longer wipe answers logged elsewhere.
- **Coming back refreshes quietly** (`sync` in `src/components/tracker.tsx`, rules in
  `src/lib/sync.ts`): when the tab returns to the foreground, "today" rolls forward (and you
  follow it if you were on "today"), and the server's state is folded in. It only does this at
  most every 15s, and never while a save is in flight or if you edited meanwhile.
- **Nothing unsaved is overwritten.** A save that failed (offline) is remembered and re-sent;
  until then a refresh keeps the screen's copy of that day.

Both the first page load and the refresh read through `readSnapshot` (`src/lib/snapshot.ts`).
New users' default spec is written once, only if missing, instead of on every page load.

## History: a past day keeps the rules it had

Changing a rule in Setup (a schedule, which options count as a slip, a counter's goal, a number's
target) must not rewrite days you already lived. When you save, the server keeps the rule you *had*
as history up to yesterday (`recordHistory` in `src/lib/spec.ts`, stored inside the spec JSON as
`past` lists on the section or question, so no new table or column). `specAt(spec, date)` returns
the spec as it stood on that day, and everything that judges a day (Today, the day strip, the
heatmap, Patterns) is handed that. History comes from the spec already saved, never from what the
client sends. Two edits in one day record nothing extra, and each list is capped at 6 entries.
A rule set for the *first* time (a question with no slip line gets one) records nothing: there was
no standard to move, so it gives meaning to the days already logged.
Patterns says "Rules changed {date}" on a row when that falls inside the window.

Old answers recorded under an old option id (Sleep's `5-6`, Skin's `wash-am`, ...) are read as
today's id when days are loaded (`normalizeData`); nothing stored is rewritten.

## Day-only picks

"Add for this day" on a choice question adds a pick for that day only, so a one-off ("Knee pain")
never piles up in your options. Its words travel inside the answer (`"~Knee pain"`), nothing is
added to your setup, and it still works as a reason on Patterns and can carry a split amount. For
something you want every day, add the option in Setup.

Removing an option in Setup never loses history either. The server remembers its id and words
(`gone` on the question, same place as `past`), and when days are loaded, answers that used it are
re-expressed as day-only picks with those words, amounts included (`normalizeData`). So an option
you added once for a single purchase can be deleted and still shows on the day you used it.

## Monthly direction: goals and a month-end review

Monthly = direction, so a month is more than a focus line. Each calendar month can hold up to six
goals (`src/lib/goals.ts`), and every one is **measured from what you already log**, never ticked:

- **days**: "do this section on at least N days" (counted from the same Reality as Patterns, each
  day by its own rules), or "a Good or Okay day on N days".
- **total**: "keep a number within / at least X this month", summed from an amount or counter question.

Progress is compared with how far through the month (or its planned days) you are, in plain words:
on pace, behind, out of reach, over, reached, missed. Suggestions come from your own setup: 80% of
a section's planned days, and a ceiling from what last month's spending actually came to.

When a month ends, the next one opens (for its first ten days) with that month's review: each
goal's verdict, your focus line, and "did you move toward it?" with room to say why. The mirror's
window also takes calendar months (`buildMirrorOver`), so "Sep" shows September as it was.

Goals and the review live in one new column, `month_focus.plan` (JSON). Run `supabase/schema.sql`
again once: it adds the column and is safe to re-run. Until then the app still loads (the page reads
every column, so a missing one just means no goals yet) but saving goals fails.
