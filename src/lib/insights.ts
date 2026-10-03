import { addDays, weekdayIndex, type Entries } from "./tracker";
import { buildMirrorOver, type Cell, type Mirror, type RowMirror } from "./mirror";
import { startedOn, type HabitSpec } from "./spec";

// Small, honest read-outs on top of the mirror. Everything here is derived from the days you
// already logged (nothing new to enter) and every claim is guarded: enough days, a big enough
// difference, and phrased as what happened, never as a cause.

const trailing = (today: string, n: number) => Array.from({ length: n }, (_, i) => addDays(today, -(n - 1 - i)));
const isGap = (s: Cell["state"]) => s === "slipped" || s === "blank";

/** "Gym", "Gym and Sleep", "Gym, Sleep and 2 more". */
export function listTitles(titles: string[], max = 3): string {
  if (titles.length <= 1) return titles.join("");
  if (titles.length <= max) return `${titles.slice(0, -1).join(", ")} and ${titles[titles.length - 1]}`;
  const rest = titles.length - (max - 1);
  return `${titles.slice(0, max - 1).join(", ")} and ${rest} more`;
}

// ---------------------------------------------------------------- the daily loop

export type CatchUp = { date: string; titles: string[] };

/** What was planned for yesterday and never logged, so Today can offer a quiet "fill it in". */
export function catchUp(spec: HabitSpec, entries: Entries, today: string): CatchUp | null {
  const date = addDays(today, -1);
  const m = buildMirrorOver(spec, entries, today, [date]);
  if (m.startedOn === null) return null;
  const titles = m.rows.filter((r) => r.cells[0].state === "blank").map((r) => r.title);
  return titles.length ? { date, titles } : null;
}

/** What's still unfinished today (a section with nothing logged, or a floor not reached yet). */
export function openToday(spec: HabitSpec, entries: Entries, today: string): string[] {
  const m = buildMirrorOver(spec, entries, today, [today]);
  if (m.startedOn === null) return [];
  return m.rows.filter((r) => r.cells[0].state === "open").map((r) => r.title);
}

/**
 * Days in a row with nothing missed: everything planned was done and nothing slipped, "the day
 * overall" included. Not "days you opened the app": a day of skipped sections doesn't extend
 * it. Today only counts once it's complete; while it's still open the run is judged to yesterday.
 * Pass `mirror` (built over the last `days` days) when the caller already has one, to not build it twice.
 */
export function cleanRun(spec: HabitSpec, entries: Entries, today: string, days = 90, mirror?: Mirror): { days: number; brokeOn: string | null } {
  const started = startedOn(entries, spec);
  if (started === null) return { days: 0, brokeOn: null };
  const dates = trailing(today, days);
  const m = mirror ?? buildMirrorOver(spec, entries, today, dates);
  const at = (i: number) => m.rows.map((r) => r.cells[i].state);

  let i = dates.length - 1;
  if (at(i).includes("open")) i--; // today isn't over: judge the run from yesterday
  let run = 0;
  for (; i >= 0; i--) {
    if (dates[i] < started) break;
    if (at(i).some(isGap)) return { days: run, brokeOn: dates[i] };
    run++;
  }
  return { days: run, brokeOn: null };
}

// ---------------------------------------------------------------- patterns

export type Trend = { gaps: number; prevGaps: number; direction: "up" | "down" | "same"; text: string };

/**
 * This window's gaps against an earlier one. Skipped unless the earlier window is fully inside
 * the time you've been logging (a window that began before you did would always look "better"),
 * and when the two plan noticeably different amounts it says so in "of planned" terms instead of
 * comparing raw counts. Pass `current` (the mirror over `dates`) when the caller already has it.
 */
export function trendLine(
  spec: HabitSpec,
  entries: Entries,
  today: string,
  dates: string[],
  prevDates: string[],
  label: string,
  current?: Mirror,
): Trend | null {
  const cur = current ?? buildMirrorOver(spec, entries, today, dates);
  const prev = buildMirrorOver(spec, entries, today, prevDates);
  if (cur.startedOn === null || prevDates.length === 0) return null;
  if (cur.startedOn > prevDates[0]) return null;
  if (cur.totals.planned === 0 || prev.totals.planned === 0) return null;

  const gaps = cur.totals.gaps;
  const prevGaps = prev.totals.gaps;
  const direction = gaps > prevGaps ? "up" : gaps < prevGaps ? "down" : "same";
  const unlike = Math.abs(cur.totals.planned - prev.totals.planned) / prev.totals.planned > 0.2;

  const word = (n: number) => (n === 1 ? "gap" : "gaps");
  const text = unlike
    ? `${gaps} of ${cur.totals.planned} planned missed, against ${prevGaps} of ${prev.totals.planned} ${label}.`
    : direction === "same"
      ? `The same as ${label} (${prevGaps}).`
      : direction === "up"
        ? `${gaps - prevGaps} more ${word(gaps - prevGaps)} than ${label} (${prevGaps}).`
        : `${prevGaps - gaps} fewer ${word(prevGaps - gaps)} than ${label} (${prevGaps}).`;
  return { gaps, prevGaps, direction, text };
}

const FULL_DAYS = ["Mondays", "Tuesdays", "Wednesdays", "Thursdays", "Fridays", "Saturdays", "Sundays"];

/** The weekday that slips clearly more than the rest, if one does (needs a month or so to say anything). */
export function weekdayShape(mirror: Mirror): { day: string; gaps: number; planned: number } | null {
  if (mirror.windowDays < 14 || mirror.totals.planned < 20 || mirror.totals.gaps < 6) return null;
  const planned = new Array<number>(7).fill(0);
  const gaps = new Array<number>(7).fill(0);
  for (const r of mirror.rows) {
    for (const c of r.cells) {
      if (c.state !== "done" && !isGap(c.state)) continue;
      const w = weekdayIndex(c.date);
      planned[w]++;
      if (isGap(c.state)) gaps[w]++;
    }
  }
  const overall = mirror.totals.gaps / mirror.totals.planned;
  let best = -1;
  let bestRate = 0;
  for (let w = 0; w < 7; w++) {
    if (planned[w] < 8 || gaps[w] < 4) continue;
    const rate = gaps[w] / planned[w];
    if (rate > bestRate) {
      best = w;
      bestRate = rate;
    }
  }
  if (best < 0 || bestRate < overall * 1.6 || bestRate - overall < 0.15) return null;
  return { day: FULL_DAYS[best], gaps: gaps[best], planned: planned[best] };
}

export type Link = { text: string; cause: string; effect: string; withCause: [number, number]; without: [number, number] };

/**
 * "When X slips, Y tends to." Looks at the last 90 days, same-day only, across every pair of
 * sections (and the day verdict). It only speaks when there's real evidence: at least four slips
 * to learn from and six clean days to compare against, the effect at least half the time when X
 * slips, and at least 35 points more often than when X was fine. It says what happened, in counts,
 * never why. At most `max` links, each section used once, so two links are two different stories.
 * Pass `mirror` (built over the last `days` days) when the caller already has one.
 */
export function findLinks(spec: HabitSpec, entries: Entries, today: string, days = 90, max = 2, mirror?: Mirror): Link[] {
  const dates = trailing(today, days);
  const m = mirror ?? buildMirrorOver(spec, entries, today, dates);
  if (m.startedOn === null) return [];

  type Candidate = { a: RowMirror; b: RowMirror; n1: number; b1: number; n0: number; b0: number; score: number };
  const found: Candidate[] = [];
  for (const a of m.rows) {
    for (const b of m.rows) {
      if (a.id === b.id) continue;
      let n1 = 0;
      let b1 = 0;
      let n0 = 0;
      let b0 = 0;
      for (let i = 0; i < dates.length; i++) {
        const sa = a.cells[i].state;
        const sb = b.cells[i].state;
        // the day verdict can only be Rough (slipped) or fine; an unlogged verdict says nothing
        const effect = b.id === "__day" ? sb === "slipped" : isGap(sb);
        const judged = b.id === "__day" ? sb === "slipped" || sb === "done" : isGap(sb) || sb === "done";
        if (!judged) continue;
        if (sa === "slipped") {
          n1++;
          if (effect) b1++;
        } else if (sa === "done") {
          n0++;
          if (effect) b0++;
        }
      }
      if (n1 < 4 || n0 < 6) continue;
      const r1 = b1 / n1;
      const r0 = b0 / n0;
      if (r1 < 0.5 || r1 - r0 < 0.35) continue;
      found.push({ a, b, n1, b1, n0, b0, score: (r1 - r0) * Math.sqrt(n1) });
    }
  }
  found.sort((x, y) => y.score - x.score);

  const out: Link[] = [];
  const used = new Set<string>();
  for (const c of found) {
    if (out.length >= max) break;
    if (used.has(c.a.id) || used.has(c.b.id)) continue;
    used.add(c.a.id);
    used.add(c.b.id);
    const cause = c.a.id === "__day" ? "On Rough days" : `When ${c.a.title} slips`;
    const effect = c.b.id === "__day" ? `the day was Rough ${c.b1} of ${c.n1} times` : `${c.b.title} had a gap ${c.b1} of ${c.n1} times`;
    out.push({
      cause,
      effect,
      text: `${cause}, ${effect}, against ${c.b0} of ${c.n0} otherwise.`,
      withCause: [c.b1, c.n1],
      without: [c.b0, c.n0],
    });
  }
  return out;
}

