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
- **Nothing unsaved is overwritten, and nothing unsaved is lost.** Every change goes into an
  *outbox* before it is sent and is crossed off when the server confirms it (see "The outbox"
  below). Until then a refresh keeps the screen's copy of that day.

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

## The daily loop and first impressions

- **Catch-up and "still open"** (`src/components/nudge.tsx`, `catchUp` / `openDetails` in
  `src/lib/insights.ts`): on Today, a quiet line when yesterday had planned sections you never logged
  (one tap goes to that day; dismissing is remembered for the day, in a small cookie so the server
  already knows), and after 8pm a line with what's still open today. Both read the same mirror as Patterns.
  The evening line tells two things apart: sections with nothing logged ("1 thing still open today: Gym.")
  and sections you did log but that are still under their goal ("Still short of your goal today: Skin &
  water (5 of 8 glasses)."). A section's tick means "you logged something here"; reaching the goal is a
  separate line you drew in Setup.
- **Number boxes in Setup** (a counter's "Hit at least" and "Max") are checked when you leave the box, not
  on every key, so you can clear one and type a new number (`settleWhole` in `src/lib/spec.ts`). A goal
  above the max lifts the max with it.
- **The streak is "days without a gap"** (`cleanRun`): everything planned done and nothing slipped,
  the day verdict included. Opening the app on a day of skipped sections doesn't extend it. Days marked
  away are stepped over: they neither extend it nor break it.
- **Away days** (`AWAY_KEY` in `src/lib/spec.ts`, `src/components/away.tsx`). A day can be marked away
  (Sick, Travelling, Resting, Something else) from the quiet "Not a normal day? Mark it away" line at the
  end of Today, from the "Away?" / "Away today?" links in the nudges, or from the Monday check-in. An away
  day isn't judged: every square on it is "away" (or "done, though not planned" if you logged it anyway),
  so it is never a gap, never "open", never asked about, and the day verdict doesn't ask why it slipped.
  Patterns says so ("Away: 2 days (1 sick, 1 travelling). Not counted.") and hatches those squares; month
  goals don't count them as planned days. It is one reserved key in the day's existing data (no new
  column), so it saves offline through the outbox like everything else, and it can be undone.
- **The Monday check-in** (`src/lib/checkin.ts`, `src/components/checkin.tsx`). Patterns says "9 gaps have
  no reason yet", and finding each square is the hard part. On Monday, Tuesday and Wednesday, Today offers
  last week (Monday to Sunday): what was planned and done, and how many gaps have no reason. "Add reasons"
  walks through them, one question each, with the reason chips you already use, grouped so you are asked as
  little as possible (a day where nothing was logged is one question, not five) and with "or the whole day
  was away" as a way out. Each answer is saved exactly where Today would save it, so Patterns can't tell
  the difference. Closing it or finishing is remembered per week (the same small cookie as the catch-up,
  written "w" + that week's Monday). A day with no verdict is explained by whatever reasons its unlogged
  sections were given, so Patterns and the check-in always agree on what is still unexplained.
- **Patterns says more, carefully** (all in `src/lib/insights.ts`, all derived, nothing new to log):
  how this window compares with the one before (skipped when the earlier window began before you
  did), the weekday that slips clearly more than the rest (needs about a month), and "worth
  noticing": when X slips, Y tends to (last 90 days, same-day only, at least 4 slips and 6 clean
  days to compare, a 35-point difference). It reports counts, never a cause.
- **First run** (`src/components/welcome.tsx`, `src/lib/templates.ts`): a new account isn't seeded
  with anyone's setup; it picks from nine starting points, each already saying what counts as a slip.
  Accounts that already have logged days keep working as before.
- **Installable**: `src/app/manifest.ts` and the icons in `public/` let a phone add Qwency to the
  home screen and open it like an app. `src/app/(app)/error.tsx` and `loading.tsx` replace the raw
  error page and the blank wait.

## Speed: what the page does on the way in

Measured with Lighthouse (mobile, slow 4G) and, once deployed, Vercel Speed Insights.

- **Region**: `vercel.json` runs functions in Mumbai (`bom1`), next to the database. Change it if the
  Supabase project is elsewhere; every page load and every save is a trip between the two.
- **The server draws the real Today** (`src/lib/clock.ts`, `src/app/(app)/page.tsx`). It works out
  your day from a `tz` cookie (the browser sets it) or Vercel's guess from your connection, so the
  heading, date and cards are in the first HTML. On arrival the browser's own calendar wins, so a
  wrong guess is corrected, never trusted. The page starts the database read and streams it in
  (`Tracker` takes a promise); the app's code downloads while the database answers.
- **Only Today is loaded up front.** Patterns, Journal, Setup and the welcome screen are separate
  chunks, fetched when a finger heads for the tab or the browser is idle. A closed fold
  (`src/components/fold.tsx`) builds nothing until it first opens.
- **The refresh when you come back** asks for the last 35 days only (`RECENT_DAYS`); coming back
  online rereads everything. A day older than that, edited on another device, shows after a reload.
- **Re-drawing**: `FieldView` redraws only when its own answer changed, with handlers that keep their
  identity (`src/lib/use-stable.ts`), and the save toast is its own small component. The code is
  written so React Compiler can compile every component (`try/finally` and a disabled lint rule each
  make it give up on a whole component, so they're avoided).
- **Layout**: nothing the server draws is removed or moved once the page is awake (dismissed
  nudges are known to the server, avatar space is reserved, sign-in has a card-shaped placeholder).
- **Not done on purpose**: no caching of signed-in pages or data anywhere shared (no `use cache`,
  no service worker), since they hold one person's days. A copy of the days kept in the browser
  wouldn't make the page paint sooner: the content follows the page's first bytes in the same
  response as soon as the database answers (tens of milliseconds in the same region), well before
  the code that could read such a copy has downloaded.

## The outbox: unsaved changes survive a dropped connection

Phones lose signal in lifts and tunnels, and apps get killed in the background. So a change is written
to an outbox (`src/lib/outbox.ts`, kept in this browser's localStorage by `src/lib/outbox-store.ts`)
*before* it is sent, and crossed off only when the server says yes.

- **What is kept**: only your unsent changes (the answers you changed, a verdict, reasons, a note, a
  focus line, a month's plan), never a copy of your days. One entry per signed-in person, so someone
  else signing in on the same phone never sees or sends yours. Changes to the same thing merge, and a
  later tap on the same question replaces the earlier one.
- **When it is sent**: right away; again when you come back to the app, when you're back online, every
  minute while something is waiting, and on the next visit. On a visit it first shows your waiting
  changes on screen (so what you did is what you see), then sends them and says "Caught up".
- **Crossed off exactly**: if you changed the same answer again while the first was on its way, the
  newer one stays waiting. Settings saves (Setup) aren't in the outbox: Setup keeps your draft.
- **Limits**: a change that still can't be saved after 14 days is given up on (so one the server
  rejects can't be retried forever), at most 60 days are kept, and storage is read defensively
  (anything unexpected is ignored). In a private window, where storage is blocked, it works in memory
  only, which is no worse than before.
- Tested as a model: replaying whatever is waiting onto the server's old copy reproduces exactly what
  was on screen, over hundreds of random sessions.

## Light and dark

The switch is the small round button in the header, beside the progress ring, and it remembers your
choice on this device. With no choice yet, the device's own setting decides. A tiny script in the page
head applies it before anything is drawn (`src/lib/theme.ts`), so a dark screen never flashes light.

- **Colours are variables** (`src/app/globals.css`): ink, cream (the page), soft (quieter text),
  surface (what "white" panels are made of), shade (shadow tint). Dark swaps them; nothing else knows
  which theme it is. Use `bg-surface`, `text-soft`, `shadow-shade`, never `bg-white` or a faint ink.
- **The coloured tiles stay pastel in both themes.** Inside one, the colours go back to the light
  palette, a touch deeper, so text clears the readability threshold even on the olive tile.
- Clerk's sign-in card and avatar menu take the app's colours through the same variables. The install
  icon's splash colour and the manifest can't change per theme, so they stay cream.

### Palettes (seasonal colours)

Light/dark is one choice; **which colours** is another, in Setup under "Colours": Qwency (the original),
Autumn, Ocean, Mono, or **Auto**, which follows the month (winter Mono, spring Qwency, summer Ocean,
autumn Autumn; the table is `SEASONS` in `src/lib/theme.ts`). Auto is the default. The pick is kept on
this device, like light/dark, so each friend wears their own. Only colours change, never your days.

- **How it works.** `<html>` carries `data-theme` (light | dark) and `data-palette`. The head script sets
  both before the first paint. A palette is one block in `globals.css` that sets the same variables dark
  mode swaps (plus the three tile colours and the tile text), and every palette except Qwency has a dark
  face (`html[data-theme="dark"][data-palette="…"]`). Nothing in a component knows which palette is on.
- **Adding one** means copying a block, filling in the same blanks, adding its name to `PALETTES`, giving
  it a season, and running the contrast audit (it reads each palette in both modes from the stylesheet).
- **Two rules a palette keeps.** The pastel tiles stay light (their text is fixed dark-on-pastel), and
  good / meh / bad stay three clearly different colours, because the Patterns map and the day dots are
  read by them. That is why Mono greys the tiles and chrome but keeps those three as muted colours
  instead of greys. Tiles take their colours from `--color-tile-1..3`, not from good / meh / bad.
- The phone's own bar (`theme-color`) is set from the page's real background once styles arrive, and
  again whenever the theme or palette changes, so it matches every palette without a table of colours.

## Readability

Soft text (hints, captions, placeholders) is one colour, `text-soft`, picked to clear 4.5:1 on every
surface it sits on in both themes. The earlier fainter shades failed that in 102 of 115 places. Text
is never smaller than 11px, and the live pairs are checked from the stylesheet itself (the contrast
audit reads `globals.css`, so it can't drift from what ships).

## Shop: a monthly pocket for the things you actually need

The fifth tab. Think of the **pocket** (your budget for the month) as a suitcase of a fixed size: needs
are packed first, wants fill what's left, and a dashed line shows where it's full. Everything below the
line waits for next month.

- **Three shelves**: *This month* (planned, counted against the pocket, each a Need or a Want), *Window*
  (links saved to look at later, never counted, no price needed) and *Bought* (receipts with what you
  actually paid, plus what you decided to skip). A thing moves Window -> This month -> Bought or Skipped.
  On a new month, things still planned from before are offered a carry-over.
- **Pocket arithmetic** (`src/lib/shop.ts`, `pocketView`): `left = pocket - bought - planned`; the order is
  needs, then wants, each in the order you set (arrows in the editor); the line falls where the running
  total passes what's free after Bought. Said in plain sentences ("The list is ₹1,896 over your pocket.
  Headphones won't fit this month."). Tested on random months: what's above the line fits, the first
  thing below it doesn't.
- **Icons, not pictures.** Each thing has an icon you pick (24 shopping icons,
  `src/lib/shop-icons.ts`), with a first guess from the words in its title (`src/lib/shop-suggest.ts`).
  There are no product photos: shops don't offer them to anyone but a browser, and a card is only there to
  remind you what to buy and where. The currency symbol is the one from your own Spending question.
  Bought is **separate from daily Spending**: nothing is written there.
- **Saving** goes through the same outbox as everything else (new kinds: `item`, `itemRemove`, `budget`),
  so adding things offline can't lose them. One database row per thing (`shop_items`), so edits merge
  cleanly; the month's pocket is a new `budget` column on the existing `month_focus` row.
  **Run `supabase/schema.sql` once** (it is safe to re-run) before saving works. Until then the tab says
  so instead of failing quietly.
- **Why there is no embedded shop (iframe):** most shops forbid being shown inside another page (Myntra,
  Apple, boAt, Ajio) or turn automated requests away (Amazon, Meesho, Ajio, Croma, Myntra), and a shop in a
  small frame breaks on phones anyway. So a thing is a small postcard instead: icon, title, price and a
  button that opens the real shop (or its app).

### Getting a product in

1. **Type it** (always works): a title and a price; optionally a link and a note.
2. **Paste a link.** The name comes straight from the link's own words with no network at all
   (`titleFromUrl`: "…/nutripro-juicer-mixer-grinder-smoothie-maker/p/hxfwhp" -> "Nutripro Juicer Mixer
   Grinder Smoothie Maker"), so it works even for shops that refuse to be read. Ad-tracking parameters
   (`utm_…`, `srsltid`, `fbclid`…) are stripped from the saved link. Then the page's own title and price are
   read (`previewLink` in `src/app/actions.ts`) where the shop allows it; your own title and price are
   never overwritten. As tested in October 2026: IKEA, Flipkart (the title, not the price), Nykaa, boAt,
   Decathlon and Apple can be read; Amazon, Meesho, Ajio and Croma answer "Access Denied" or "not found" to
   anything automated and Myntra never answers, so those can't be read, and we don't try to get around
   that (the reader says who it is): type the price. Shop wording around a name ("Buy X Online", "X Online
   at Best Price On Flipkart.com") is trimmed off. It reads one page you pasted, on your request, and never
   stores it.
   `src/lib/linkpreview.ts` is careful on purpose: http(s) only and the ordinary ports, the address is
   looked up once and checked, then that exact address is connected to (no private, loopback, link-local
   or metadata addresses, IPv6 included), every redirect is checked the same way (at most four), a few
   seconds and about a megabyte at most, HTML only, and a mild per-person rate limit. The rules and a
   misbehaving local server are covered by tests.
3. **Share to Qwency (Android)**: in a shop's app or a web page, Share -> Qwency opens Shop with the title
   and link filled in (`share_target` in `src/app/manifest.ts`, landing route `src/app/(app)/shop/add`);
   you add the price and press Add. Android only (iPhone doesn't support it, so paste there). Chrome reads
   the manifest when the app is installed, so an app installed before this existed may need to be added to
   the home screen again before Qwency shows up in the Share sheet.

