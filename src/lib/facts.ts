import { addDays, weekdayIndex, WHY_TAGS, type Entries } from "./tracker";
import { buildMirrorOver, type Mirror } from "./mirror";
import { awayOf, fieldVisible, formatAmount, hasActivity, sectionDone, specAt, startedOn, type FieldSpec, type HabitSpec } from "./spec";

// The fact engine: what only your own days can say, found by counting, never by guessing.
//
// Every day is turned into a handful of plain yes/no/unknown facts ("Sleep was < 5h", "Gym was missed",
// "the day was Rough", "it was a Friday"). The engine asks, for each pair, whether one tends to come with the
// other on the same day or the day after, and says so only when the evidence is real:
//   - enough days on both sides to compare, and a big gap between the two rates
//   - the gap isn't one that chance makes easily (Fisher's exact test, with Benjamini-Hochberg so that asking
//     hundreds of questions doesn't make a lucky one look true)
//   - it survives the check that days next to each other resemble each other (the days are lined up against
//     themselves moved along by a few days, many times; a real link beats nearly all of those, a streak or a
//     trip week that happens to line up does not)
// Only what was actually answered is compared: a day where the cause wasn't logged is not "the other group".
// An away day is never looked at. Nothing here is a cause, only what went together, and every fact carries its
// counts and the days it came from, so it can be checked. No AI and no network: the same days always give
// the same facts.

export const FACT_MIN_DAYS = 21;
const WINDOW = 120;

const trailing = (today: string, n: number) => Array.from({ length: n }, (_, i) => addDays(today, -(n - 1 - i)));

export type Fact = {
  /** stable across runs for the same finding, so a screen can keep its place */
  id: string;
  kind: "link" | "reason";
  text: string;
  /** the two rates behind the sentence, as [times, out of] */
  with: [number, number];
  without: [number, number];
  /** the days it came from (newest first), so it can be looked at */
  days: string[];
  /** what it is about (a section, the day overall): the same one is never spoken about twice in a row of facts */
  subjects: string[];
  /** only for ordering */
  strength: number;
};

export type Facts = {
  facts: Fact[];
  /** days with something logged that were looked at */
  judged: number;
  /** more logged days needed before anything is said (0 once there are enough) */
  need: number;
  /** for checking the engine itself: questions asked / kept after the evidence rule / kept after the shifting check */
  tested: number;
  passed: number;
  confirmed: number;
};

// ---------------------------------------------------------------- the statistics

const LF = [0];
for (let i = 1; i <= 400; i++) LF[i] = LF[i - 1] + Math.log(i);
const lchoose = (n: number, k: number) => LF[n] - LF[k] - LF[n - k];

/** Fisher's exact test, two-sided, for [[a, b], [c, d]]. */
export function fisher(a: number, b: number, c: number, d: number): number {
  const r1 = a + b;
  const r2 = c + d;
  const c1 = a + c;
  const n = r1 + r2;
  if (n > 400) return 1;
  const at = (x: number) => lchoose(r1, x) + lchoose(r2, c1 - x) - lchoose(n, c1);
  const seen = at(a);
  let p = 0;
  for (let x = Math.max(0, c1 - r2); x <= Math.min(r1, c1); x++) {
    const l = at(x);
    if (l <= seen + 1e-9) p += Math.exp(l);
  }
  return Math.min(1, p);
}

/** Benjamini-Hochberg: which of these p-values still stand when every one of them was a question asked. */
export function benjaminiHochberg(ps: number[], q: number): boolean[] {
  const order = ps.map((p, i) => [p, i] as const).sort((x, y) => x[0] - y[0]);
  let cut = -1;
  order.forEach(([p], rank) => {
    if (p <= (q * (rank + 1)) / ps.length) cut = rank;
  });
  const keep = new Array<boolean>(ps.length).fill(false);
  for (let r = 0; r <= cut; r++) keep[order[r][1]] = true;
  return keep;
}

// ---------------------------------------------------------------- one yes / no / unknown per day

// 1 = yes, 0 = no, -1 = unknown (not logged, not judged, or an away day). Index 0 is the oldest day.
type Series = Int8Array;

type Cause = {
  /** how a sentence starts when this is on the same day; null if it can't be (nothing to say about "the day before a Friday") */
  now: string | null;
  /** how it starts about the day after */
  before: string | null;
  /** what the other group is called in "against 2 of 20 ...", when "otherwise" would be unclear */
  other?: string;
};

type Variable = {
  id: string;
  /** what it is about: a section, the mood, the weekday... a pair from the same group is never asked (it would be one thing said twice) */
  group: string;
  cause?: Cause;
  /** the end of a sentence: "Gym was missed", "the day was Rough" */
  effect?: string;
  /** where it sits in your day (the order of your sections, the day overall last), so a link is told in the order it happened */
  order: number;
  s: Series;
};

const countOf = (s: Series, v: number) => s.reduce((n, x) => n + (x === v ? 1 : 0), 0);

function variable(v: Variable): Variable | null {
  // something that nearly never (or nearly always) happens has nothing to compare
  return countOf(v.s, 1) >= 3 && countOf(v.s, 0) >= 3 ? v : null;
}

/** Sections and the day overall are spoken about once; the weekday and "a day with a slip" are only ways of looking. */
const spoken = (group: string) => group !== "weekday" && group !== "day";

const WEEKDAY_NAMES = ["Mondays", "Tuesdays", "Wednesdays", "Thursdays", "Fridays", "Saturdays", "Sundays"];
const quoted = (s: string) => `“${s}”`;

function build(spec: HabitSpec, entries: Entries, dates: string[], m: Mirror, live: boolean[]): Variable[] {
  const n = dates.length;
  const out: Variable[] = [];
  const add = (v: Variable | null) => v && out.push(v);
  const series = (f: (i: number) => number): Series => Int8Array.from({ length: n }, (_, i) => (live[i] ? f(i) : -1));

  // a day you logged nothing at all is a different thing from a section left blank on a day you did log: it says you weren't
  // here, not that this one question was skipped, so a blank section is only counted on a day with something else logged
  const active = dates.map((d, i) => live[i] && hasActivity(entries[d], spec));
  const lastActive = active.lastIndexOf(true);

  // every section: did it slip, was it left blank (judged only on days it was planned)
  const rows = new Map(m.rows.map((r) => [r.id, r]));
  spec.sections.forEach((sec, si) => {
    const row = rows.get(sec.id);
    if (row) {
      const g = `sec:${sec.id}`;
      add(
        variable({
          id: `slip:${sec.id}`,
          group: g,
          order: si,
          cause: { now: `When ${sec.title} was missed`, before: `The day after ${sec.title} was missed` },
          effect: `${sec.title} was missed`,
          s: series((i) => (row.cells[i].state === "slipped" ? 1 : row.cells[i].state === "done" ? 0 : -1)),
        }),
      );
      add(
        variable({
          id: `blank:${sec.id}`,
          group: g,
          order: si,
          effect: `${sec.title} wasn't logged`,
          s: series((i) => (row.cells[i].state === "blank" ? (active[i] ? 1 : -1) : row.cells[i].state === "done" || row.cells[i].state === "slipped" ? 0 : -1)),
        }),
      );
    }

    sec.fields.forEach((field, fi) => {
      const g = `sec:${sec.id}`;
      // the question as it stood that day (a goal or a line may have moved since)
      const at = (i: number): FieldSpec => specAt(spec, dates[i]).sections[si].fields[fi];
      const data = (i: number) => entries[dates[i]]?.data ?? {};
      const shown = (i: number) => fieldVisible(field, data(i));

      if (field.kind === "single") {
        for (const o of field.options) {
          const label = `${sec.title} was ${quoted(o.label)}`;
          add(
            variable({
              id: `is:${field.key}=${o.id}`,
              group: g,
              order: si,
              cause: { now: `When ${label}`, before: `The day after ${label}` },
              effect: label,
              s: series((i) => {
                const v = data(i)[field.key];
                return shown(i) && typeof v === "string" ? (v === o.id ? 1 : 0) : -1;
              }),
            }),
          );
        }
      } else if (field.kind === "multi") {
        for (const o of field.options) {
          const label = `${sec.title} included ${quoted(o.label)}`;
          add(
            variable({
              id: `has:${field.key}+${o.id}`,
              group: g,
              order: si,
              cause: { now: `When ${label}`, before: `The day after ${label}` },
              effect: label,
              s: series((i) => {
                const v = data(i)[field.key];
                const e = entries[dates[i]];
                if (!shown(i) || !e || !sectionDone(e, sec)) return -1;
                return Array.isArray(v) && v.includes(o.id) ? 1 : 0;
              }),
            }),
          );
        }
      } else if (field.kind === "counter") {
        const label = `${field.label} reached ${field.goal} ${field.unit}`;
        add(
          variable({
            id: `goal:${field.key}`,
            group: g,
            order: si,
            cause: { now: `When ${label}`, before: `The day after ${label}` },
            effect: label,
            s: series((i) => {
              const v = data(i)[field.key];
              const f = at(i);
              return typeof v === "number" && f.kind === "counter" ? (v >= f.goal ? 1 : 0) : -1;
            }),
          }),
        );
      } else if (!field.target) {
        // an amount with no line of its own: "a big one" is your own top quarter, so it means something different for everyone
        const positive = dates
          .map((_, i) => (live[i] ? data(i)[field.key] : undefined))
          .filter((v): v is number => typeof v === "number" && v > 0)
          .sort((a, b) => a - b);
        if (positive.length >= 8) {
          const limit = positive[Math.ceil(positive.length * 0.75) - 1];
          const label = `${field.label} was ${formatAmount(field, limit)} or more`;
          add(
            variable({
              id: `high:${field.key}`,
              group: g,
              order: si,
              cause: { now: `When ${label}`, before: `The day after ${label}` },
              effect: label,
              s: series((i) => {
                const v = data(i)[field.key];
                return typeof v === "number" ? (v > 0 && v >= limit ? 1 : 0) : -1;
              }),
            }),
          );
        }
      }
    });
  });

  // the days you weren't here at all, between your first and your latest: when you stop logging is itself worth knowing
  add(
    variable({
      id: "empty",
      group: "logging",
      order: 102,
      effect: "nothing was logged",
      s: series((i) => (i > lastActive ? -1 : active[i] ? 0 : 1)),
    }),
  );

  // the day overall
  const mood = (i: number) => entries[dates[i]]?.mood ?? null;
  add(
    variable({
      id: "mood:rough",
      group: "mood",
      order: 100,
      cause: { now: "On Rough days", before: "The day after a Rough day" },
      effect: "the day was Rough",
      s: series((i) => (mood(i) === null ? -1 : mood(i) === "bad" ? 1 : 0)),
    }),
  );
  add(
    variable({
      id: "mood:good",
      group: "mood",
      order: 100,
      cause: { now: "On Good days", before: "The day after a Good day" },
      effect: "the day was Good",
      s: series((i) => (mood(i) === null ? -1 : mood(i) === "good" ? 1 : 0)),
    }),
  );

  // did anything slip that day (a section, or a Rough verdict): it is built from the others, so it is only ever asked about the day before
  const day = series((i) => {
    const states = m.rows.map((r) => r.cells[i].state);
    if (states.includes("slipped")) return 1;
    return states.includes("done") ? 0 : -1;
  });
  add(
    variable({
      id: "day:slip",
      group: "day",
      order: 101,
      cause: { now: null, before: "The day after a day with something missed", other: "after a day with none" },
      effect: "something was missed",
      s: day,
    }),
  );

  // the weekday: only on the same day, and only against what the weekday can't explain by itself
  WEEKDAY_NAMES.forEach((name, w) =>
    add(
      variable({
        id: `wd:${w}`,
        group: "weekday",
        order: -1,
        cause: { now: `On ${name}`, before: null, other: "on other days" },
        s: series((i) => (weekdayIndex(dates[i]) === w ? 1 : 0)),
      }),
    ),
  );
  add(
    variable({
      id: "wd:weekend",
      group: "weekday",
      order: -1,
      cause: { now: "On weekends", before: null, other: "on weekdays" },
      s: series((i) => (weekdayIndex(dates[i]) >= 5 ? 1 : 0)),
    }),
  );

  return out;
}

/**
 * A very large setup has hundreds of single answers, and every one is asked against every other. Past this many, the ones
 * about sections, the mood and the weekday are all kept and the single answers are thinned to the ones with the most
 * days on both sides (judged by how often they happened, never by what they went with), so the work stays bounded.
 */
const MAX_VARIABLES = 100;
function limited(vars: Variable[]): Variable[] {
  if (vars.length <= MAX_VARIABLES) return vars;
  const answers = (v: Variable) => /^(is|has|goal|high):/.test(v.id);
  const room = Math.max(0, MAX_VARIABLES - vars.filter((v) => !answers(v)).length);
  const balance = (v: Variable) => Math.min(countOf(v.s, 1), countOf(v.s, 0));
  const keep = new Set(vars.filter(answers).sort((x, y) => balance(y) - balance(x) || (x.id < y.id ? -1 : 1)).slice(0, room));
  return vars.filter((v) => !answers(v) || keep.has(v));
}

// ---------------------------------------------------------------- asking each pair

type Table = { a: number; b: number; c: number; d: number };

/** Cause present/absent against effect yes/no, over the days in [from, to) where both are known (the cause read `lag` days earlier). */
function table(cause: Series, effect: Series, lag: number, shift = 0, from = 0, to = cause.length): Table {
  const n = cause.length;
  let a = 0;
  let b = 0;
  let c = 0;
  let d = 0;
  for (let i = Math.max(lag, from); i < to; i++) {
    const x = cause[i - lag];
    if (x < 0) continue;
    const y = effect[(i + shift) % n];
    if (y < 0) continue;
    if (x === 1) y === 1 ? a++ : b++;
    else y === 1 ? c++ : d++;
  }
  return { a, b, c, d };
}

const rate = (hit: number, of: number) => (of === 0 ? 0 : hit / of);
const gap = (t: Table) => rate(t.a, t.a + t.b) - rate(t.c, t.c + t.d);
/** How closely the two go together, the same whichever is called the cause (the correlation of two yes/no things). */
const togetherness = (t: Table) => {
  const bottom = Math.sqrt((t.a + t.b) * (t.c + t.d) * (t.a + t.c) * (t.b + t.d));
  return bottom === 0 ? 0 : Math.abs((t.a * t.d - t.b * t.c) / bottom);
};

/**
 * Enough on each side to compare at all. This looks only at how many days there are in each group and how often the
 * effect happened, never at whether the two rates differ: every pair that can be asked is a question that counts
 * towards how many chances there were to be fooled.
 */
function askable(t: Table): boolean {
  return t.a + t.b >= 5 && t.c + t.d >= 8 && t.a + t.c >= 4 && t.b + t.d >= 4;
}

/** The smallest p-value any table with these totals could have: how strong the evidence could ever be, however the days fell. */
function bestPossible(t: Table): number {
  const r1 = t.a + t.b;
  const r2 = t.c + t.d;
  const c1 = t.a + t.c;
  const hi = Math.min(r1, c1);
  const lo = Math.max(0, c1 - r2);
  return Math.min(fisher(hi, r1 - hi, c1 - hi, r2 - (c1 - hi)), fisher(lo, r1 - lo, c1 - lo, r2 - (c1 - lo)));
}

/**
 * Which questions are worth counting at all (Tarone's rule for tests like this one): a pair whose days could never
 * give strong evidence, however they fell, isn't a real chance to find anything, so it shouldn't make the bar higher
 * for the pairs that are. Looks only at the totals, never at what happened.
 */
function worthCounting(best: number[], q: number): boolean[] {
  const sorted = [...best].sort((x, y) => x - y);
  let reach = 0;
  for (let k = 1; k <= sorted.length; k++) {
    while (reach < sorted.length && sorted[reach] <= q / k) reach++;
    if (reach <= k) return best.map((x) => x <= q / k);
  }
  return best.map(() => true);
}

/**
 * How surely the evidence has to hold: the share of what is said that may turn out to be luck. Questions about whole
 * sections, the mood and the weekday are few and are things you set up yourself; the many about single answers
 * (one option of one question against another) are a wider net, so they have to be surer.
 */
const Q = 0.02;
const Q_ANSWERS = 0.01;
/** What is worth saying out loud, once the evidence has held: a big gap, not a small real one. */
const BIG_GAP = 0.3;

/**
 * How often moving the effect along by some other number of days (round the window, so a streak stays a streak)
 * gives a gap as big as the one seen. A real link is hard to match; a streak that merely lines up is not. Whole
 * weeks are among the shifts on purpose: two things that both happen on the same weekdays line up again every week,
 * and are better told as what happens on those weekdays than as one causing the other. (A weekday itself is not asked
 * this: moving things along only ever lands them on another weekday that looks much the same.)
 */
function matchedByShifting(cause: Series, effect: Series, lag: number, seen: number): number {
  let tried = 0;
  let matched = 0;
  for (let s = 1; s < cause.length; s++) {
    const t = table(cause, effect, lag, s);
    if (t.a + t.b < 3 || t.c + t.d < 3) continue;
    tried++;
    if (Math.abs(gap(t)) >= Math.abs(seen) - 1e-12) matched++;
  }
  return tried === 0 ? 1 : (1 + matched) / (1 + tried);
}

/** Does it show up the same way in each half of the window? (A cluster that happened once, in one week, doesn't.) */
function holdsInBothHalves(cause: Series, effect: Series, lag: number, seen: number): boolean {
  const mid = cause.length >> 1;
  return [table(cause, effect, lag, 0, 0, mid), table(cause, effect, lag, 0, mid, cause.length)].every(
    (t) => t.a + t.b >= 2 && t.c + t.d >= 3 && Math.sign(gap(t)) === Math.sign(seen) && Math.abs(gap(t)) >= BIG_GAP / 2,
  );
}

type Found = { cause: Variable; effect: Variable; lag: number; t: Table; p: number; best: number };

/** The questions about sections, the mood, the weekday and "a day with a slip" are asked on their own; the many about single answers on theirs. */
const tierOf = (f: Found) => (/^(is|has|goal|high):/.test(f.cause.id) || /^(is|has|goal|high):/.test(f.effect.id) ? 2 : 1);

function links(vars: Variable[], dates: string[], counts: { tested: number; passed: number; confirmed: number }): Fact[] {
  const found: Found[] = [];
  for (const effect of vars) {
    if (!effect.effect) continue;
    for (const cause of vars) {
      if (!cause.cause) continue;
      for (const lag of [0, 1]) {
        if (!(lag === 0 ? cause.cause.now : cause.cause.before)) continue;
        // the same thing said twice: a section against its own answers, the mood against itself, a sum against its parts
        if (lag === 0 && (cause.group === effect.group || (effect.group === "day" && cause.group !== "weekday"))) continue;
        const t = table(cause.s, effect.s, lag);
        if (!askable(t)) continue;
        found.push({ cause, effect, lag, t, p: fisher(t.a, t.b, t.c, t.d), best: 1 });
      }
    }
  }
  counts.tested = found.length;

  // each kind of question has its own bar (so the many about single answers don't drown the few about whole sections)
  const passed: Found[] = [];
  for (const tier of [1, 2]) {
    const group = found.filter((f) => tierOf(f) === tier);
    group.forEach((f) => (f.best = bestPossible(f.t)));
    const q = tier === 1 ? Q : Q_ANSWERS;
    const counted = worthCounting(group.map((f) => f.best), q);
    const pool = group.filter((_, i) => counted[i]);
    const keep = benjaminiHochberg(pool.map((f) => f.p), q);
    passed.push(...pool.filter((f, i) => keep[i] && Math.abs(gap(f.t)) >= BIG_GAP));
  }
  counts.passed = passed.length;

  const confirmed = passed.filter(
    (f) =>
      holdsInBothHalves(f.cause.s, f.effect.s, f.lag, gap(f.t)) &&
      (f.cause.group === "weekday" || matchedByShifting(f.cause.s, f.effect.s, f.lag, gap(f.t)) <= 0.05),
  );
  counts.confirmed = confirmed.length;

  // the same story told from both ends (the day was Rough / Gym was missed) is kept once, and one story per pair of subjects
  const ranked = confirmed
    .map((f) => ({ f, tier: tierOf(f), score: -Math.log10(Math.max(f.p, 1e-12)) * togetherness(f.t) + (f.cause.order < f.effect.order ? 1e-6 : 0) + (f.effect.id === "mood:rough" ? 2e-6 : 0) }))
    .sort((x, y) => x.tier - y.tier || y.score - x.score);
  const seenPair = new Set<string>();
  const seenSubjects = new Set<string>();
  const out: Fact[] = [];
  for (const { f, score } of ranked) {
    const pair = f.lag === 0 ? [f.cause.id, f.effect.id].sort().join("~") : `${f.cause.id}>${f.effect.id}`;
    // the same two subjects on the same day are one story, whichever was asked as the cause; across days the order matters
    const subjects = f.lag === 0 ? [f.cause.group, f.effect.group].sort().join("|") : `${f.cause.group}>${f.effect.group}`;
    if (seenPair.has(pair) || seenSubjects.has(subjects)) continue;
    seenPair.add(pair);
    seenSubjects.add(subjects);

    const lead = (f.lag === 0 ? f.cause.cause!.now : f.cause.cause!.before)!;
    const withN = f.t.a + f.t.b;
    const withoutN = f.t.c + f.t.d;
    const days: string[] = [];
    for (let i = dates.length - 1; i >= f.lag && days.length < 8; i--) {
      if (f.cause.s[i - f.lag] === 1 && f.effect.s[i] === (gap(f.t) > 0 ? 1 : 0)) days.push(dates[i]);
    }
    out.push({
      id: `link:${f.cause.id}${f.lag ? ">" : "="}${f.effect.id}`,
      kind: "link",
      subjects: [f.cause.group, f.effect.group].filter(spoken),
      text: `${lead}, ${f.effect.effect} ${f.t.a} of ${withN} times, against ${f.t.c} of ${withoutN} ${f.cause.cause!.other ?? "otherwise"}.`,
      with: [f.t.a, withN],
      without: [f.t.c, withoutN],
      days,
      strength: score,
    });
  }
  return out.sort((x, y) => y.strength - x.strength);
}

// ---------------------------------------------------------------- what you said got in the way

function reasons(m: Mirror): Fact[] {
  type Gap = { row: string; title: string; date: string; reasons: string[] };
  const gaps: Gap[] = [];
  for (const r of m.rows) {
    for (const c of r.cells) {
      if ((c.state === "slipped" || c.state === "blank") && c.reasons.length > 0) {
        gaps.push({ row: r.id, title: r.id === "__day" ? "Rough day" : r.title, date: c.date, reasons: c.reasons.map((x) => x.toLowerCase()) });
      }
    }
  }
  const labels = new Map<string, string>();
  for (const r of m.rows) for (const rc of r.reasons) labels.set(rc.label.toLowerCase(), rc.label);
  // only the reasons every question can be given: one that a single question offers ("Sore" for Gym) is just that question's menu
  const shared = new Set<string>(WHY_TAGS.map((t) => t.label.toLowerCase()));

  type Asked = { r: Mirror["rows"][number]; key: string; mine: Gap[]; others: Gap[]; a: number; c: number; diff: number; p: number };
  const asked: Asked[] = [];
  for (const r of m.rows) {
    const mine = gaps.filter((g) => g.row === r.id);
    const others = gaps.filter((g) => g.row !== r.id);
    if (mine.length < 8 || others.length < 10) continue;
    for (const key of new Set(mine.flatMap((g) => g.reasons).filter((x) => shared.has(x)))) {
      const a = mine.filter((g) => g.reasons.includes(key)).length;
      const c = others.filter((g) => g.reasons.includes(key)).length;
      const diff = rate(a, mine.length) - rate(c, others.length);
      asked.push({ r, key, mine, others, a, c, diff, p: fisher(a, mine.length - a, c, others.length - c) });
    }
  }
  const keep = benjaminiHochberg(asked.map((x) => x.p), Q);
  const best = new Map<string, Asked>();
  asked.filter((x, i) => keep[i] && x.a >= 5 && x.diff >= BIG_GAP).forEach((x) => {
    const had = best.get(x.r.id);
    if (!had || x.p < had.p) best.set(x.r.id, x);
  });
  return [...best.values()].map((x): Fact => {
    const what = x.r.id === "__day" ? "Rough days" : `${x.r.title} misses`;
    return {
      id: `reason:${x.r.id}:${x.key}`,
      kind: "reason",
      text: `You named ${quoted(labels.get(x.key) ?? x.key)} for ${x.a} of ${x.mine.length} ${what}, against ${x.c} of ${x.others.length} other misses.`,
      with: [x.a, x.mine.length],
      without: [x.c, x.others.length],
      subjects: [x.r.id === "__day" ? "mood" : `sec:${x.r.id}`],
      days: x.mine.filter((g) => g.reasons.includes(x.key)).map((g) => g.date).sort().reverse().slice(0, 8),
      strength: -Math.log10(Math.max(x.p, 1e-12)) * x.diff,
    };
  });
}

// ---------------------------------------------------------------- the whole thing

/**
 * What the last 90 days say that is worth saying, strongest first, at most `max`, and no two about the same
 * thing (a section is spoken about once). Says nothing when there isn't enough to go on: `need` is how many more
 * logged days it wants. `skip` is the ids of facts the person closed. Pass `mirror` (built over the last `days` days) when the caller already has one.
 */
export function findFacts(spec: HabitSpec, entries: Entries, today: string, opts: { days?: number; max?: number; mirror?: Mirror; skip?: readonly string[] } = {}): Facts {
  const days = opts.days ?? WINDOW;
  const max = opts.max ?? 3;
  const none = (judged: number): Facts => ({ facts: [], judged, need: Math.max(0, FACT_MIN_DAYS - judged), tested: 0, passed: 0, confirmed: 0 });

  const started = startedOn(entries, spec);
  if (started === null) return none(0);
  const dates = trailing(today, days);
  // a day is looked at once it's over, after you started, and not marked away
  const live = dates.map((d) => d >= started && d < today && awayOf(entries[d]) === null);
  const judged = dates.filter((d, i) => live[i] && hasActivity(entries[d], spec)).length;
  if (judged < FACT_MIN_DAYS) return none(judged);

  const m = opts.mirror && opts.mirror.windowDays === days ? opts.mirror : buildMirrorOver(spec, entries, today, dates);
  const vars = limited(build(spec, entries, dates, m, live));

  const counts = { tested: 0, passed: 0, confirmed: 0 };
  const all = [...links(vars, dates, counts), ...reasons(m)].sort((x, y) => y.strength - x.strength);

  // strongest first, and a section is spoken about once: "Gym" in a link rules out "Gym" in a shift
  const used = new Set<string>();
  const facts: Fact[] = [];
  for (const f of all) {
    if (facts.length >= max) break;
    if (opts.skip?.includes(f.id)) continue; // closed by the person: not shown, and it doesn't hold its place
    if (f.subjects.some((x) => used.has(x))) continue;
    f.subjects.forEach((x) => used.add(x));
    facts.push(f);
  }
  return { facts, judged, need: 0, ...counts };
}
