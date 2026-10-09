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
page is measured against that plan (`src/lib/mirror.ts`): **Done**, **Missed** (a
bad-toned answer) and **Not logged** (nothing on a planned day) with a **Why** (reason chips, the answer
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
- **Saving is quiet.** A tap that saves fine says nothing: the chip filling in and the ring moving are the answer, so
  there is no "Saved" pill after every tap. The pill at the bottom speaks only when there is something to say: a save
  that failed ("Not saved yet. Will retry."), a save that is taking longer than 1.5 seconds ("Saving…", which goes
  without a word once it is through), "Caught up. Everything is saved." after a failure is put right, and news the tap
  doesn't show by itself (the day just became complete, a small line after the day's mood, a day marked away, a
  Shop item moving to another shelf). `persist` in `tracker.tsx` is where that is decided.
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

- **Today, top to bottom** (`tracker.tsx`, `section-card.tsx`, `lib/today.ts`, `nudge.tsx`, `first-run.tsx`).
  1. A new account (nothing logged anywhere) gets one short card, "Start anywhere": nothing is required, and
     what the ring and the dots under the days mean. It goes by itself with the first tap.
  2. One quiet box for the two nudges, each line with the same small close button: "Wednesday: 6 not logged.
     Fill in · Away?" (yesterday had planned sections you never logged) and, after 8pm, "4 things still open
     today. Away today?". Closing either is remembered (a small cookie, "w" week / "e" evening / the day, so
     the server already knows). Both read the same mirror as Patterns. A section's tick means "you logged
     something here"; reaching a goal is a separate line you drew in Setup.
  3. **The day overall comes first**, as one slim card: three faces ("How's today going?"). That is the lightest
     possible way to log a day. A Rough day asks "What got in the way?" right under the faces; the day's note
     (the pen) and "mark it away" live in the same card.
  4. **A section you finished earlier is one line** ("Sleep · 6–7h", with a red dot and "(missed)" for the screen
     reader if an answer went the wrong way): a coloured card means "still to do", a quiet one means "done", and
     the page is shorter every time you come back to it. "Finished" is `sectionComplete`: every question that is
     showing and has to be answered is answered, a counter has reached its goal (on a past day there is nothing
     left to reach), and picks you may or may not make (which muscles, a reason after a skip) never keep it open.
     Folding happens only when the day is opened (leaving the tab and coming back, or choosing another day, counts)
     or when you tap the chevron yourself. **A card you are answering never closes on its own**, however fast you
     tap, so a second answer, a muscle or a note can always follow. A folded line opens when tapped, and then
     stays open until you tuck it away.
  5. **One pen per card** opens that section's note (a dot says there is one), instead of a "+ Note" line under
     every card; "add your own, for this day only" is a small + after the options.
  Touch: an answer you tap is 44px tall, the small reason chips 36px, and small links and close buttons keep
  their size but get an invisible finger-sized area (`.hit`, `.hit-y`). The progress ring and each day in the
  strip say in words what they are.
- **Setup** is two parts, switched at the top: *Your day* (the sections) and *The app* (Shop, Colours). An unsaved
  draft is kept by the app while you look at another tab (Setup is only built while it is on screen): the bottom
  bar shows a dot on Setup, you come back to the same draft and open section, closing or reloading the page
  asks first, and a draft made against a setup that has since changed (on another device) is dropped rather
  than laid over the newer one.
- **Journal** reads back every note newest first, under a heading for each month, with the day's feeling as a filled
  face (and said in words for a screen reader). With no notes it says where they come from: the pen on Today.
- **The bottom bar names the tab you are on** (icons only for the rest on a phone), so no icon is a guess.
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
- **The Patterns page, top to bottom** (`overview.tsx`, `mirror-card.tsx`, `noticing.tsx`, `month.tsx`), in plain
  words: *Done*, *Missed* (it landed on the wrong side of the line you drew), *Not logged*, *Why*.
  1. Last month's review, only until it is answered. Answering saves and folds the card to one slim line
     ("September reviewed: Yes. Add a note"); it is gone after the 10th.
  2. This month's direction as **one slim line** (your words and "2 of 3 on track"). Tapping it opens the
     focus line and the goals in place.
  3. **The mirror**: "You did 40 of 44 planned things", a bar of done / missed / not logged, how it compares
     with before, and **which sections were missed, by name** with how many (a tap opens that section's detail).
  4. **Day by day**: one grid for the whole window, a row per section (your order, the day overall last) and a
     square per day. The day overall shows Good / Okay / Rough colours. A row opens for its detail (done, missed,
     not logged, why, what the line was, where a number went, notes). Long windows keep the squares and drop the
     names to icons.
  5. **Worth noticing** (below). Every fact has its own ✕ and stays closed in this browser; the "starts after
     about 3 weeks" message can be closed too, and facts show again once there are some.
  6. The 10-week heatmap.
- **Patterns says more, carefully** (all derived, nothing new to log): how this window compares with
  the one before (skipped when the earlier window began before you did, `src/lib/insights.ts`), the
  weekday that slips clearly more than the rest (needs about a month), and "worth noticing", below.
- **Worth noticing: the fact engine** (`src/lib/facts.ts`, no AI, no network). What only your own days can
  say, found by counting. Each day becomes a few yes / no / unknown facts (Sleep was missed, Gym was
  Skipped, the day was Rough, it was a Friday, nothing was logged) and every pair is asked: does one go
  with the other, the same day or the day after? A pair is only reported when all of this holds:
  enough days on both sides; a gap of at least 30 points between the two rates; Fisher's exact test
  survives **Benjamini-Hochberg** over *every* question asked (with Tarone's rule, so pairs that could
  never give strong evidence don't raise the bar; questions about whole sections, the mood and the
  weekday are corrected as one group, the many about single answers as another with a stricter bar); it **shows up the same way
  in both halves** of the window; and it beats the days **lined up against themselves shifted along**
  (so a streak or a trip week that happens to line up doesn't count, nor two things that both happen on
  the same weekdays: those are told as the weekday facts instead). Only what was answered is compared (a
  day the cause wasn't logged is not "the other group"), an away day is never looked at, and "a section
  left blank" only counts on a day something else was logged. A day you logged nothing at all is its own
  fact ("On weekends, nothing was logged 24 of 24 times"; "The day after a Rough day, nothing was
  logged"), and only between your first and latest day. A second kind says which shared reason you name
  for a section's misses against everyone else's ("You named “Tired” for 9 of 12 Gym misses, against 3 of
  25 other misses"); a reason that only one question offers is never reported. Every line carries its
  counts and **the days it came from** ("See the days", each opens that day). It says nothing under 21
  logged days (and says how many more it wants), tells one story per pair of subjects, at most three, and
  never a cause. Same days in, same facts out. Checked against simulated lives: planted links are found;
  with nothing linked (independent, or with streaks) about 1 life in 150 is told anything.
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

An optional tab, **off until you switch it on** (Setup -> Pages -> Shop), so a newcomer sees only the
focused app. The switch is part of your setup (one flag in your saved spec, no new table or column), so it
follows you across devices, and it saves on its own, at once. Switching it off only hides the tab and keeps
everything you saved. A small cookie keeps a copy so the loading picture of the bottom bar already has the
right tabs; with it off, the Shop code isn't even downloaded. Shared into the app from a shop while it is
off, you land on Today with a note to switch it on and share again.

The tab itself: think of the **pocket** (your budget for the month) as a suitcase of a fixed size: needs
are packed first, wants fill what's left, and a dashed line shows where it's full. Everything below the
line waits for next month.

- **Three shelves**: *This month* (planned, counted against the pocket, each a Need or a Want), *Saved*
  (links to look at later, never counted, no price needed; `window` in the code) and *Bought* (receipts with what you
  actually paid, plus what you decided to skip). A thing moves Saved -> This month -> Bought or Skipped.
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

