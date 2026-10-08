import { addDays, weekdayIndex, type Entries } from "./tracker";
import { buildMirrorOver, type Cell, type Mirror } from "./mirror";
import { formatAmount, isSlip, startedOn, targetOf, type HabitSpec } from "./spec";

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

/**
 * What's still unfinished today. `short` is empty for a section with nothing logged; otherwise it was
 * logged and is only under a floor so far, said as the numbers ("5 of 8 glasses").
 */
export type OpenItem = { title: string; short: string[] };

export function openDetails(spec: HabitSpec, entries: Entries, today: string): OpenItem[] {
  const m = buildMirrorOver(spec, entries, today, [today]);
  if (m.startedOn === null) return [];
  const data = entries[today]?.data ?? {};
  return m.rows
    .filter((r) => r.cells[0].state === "open")
    .map((r) => {
      const section = spec.sections.find((s) => s.id === r.id);
      const short = (section?.fields ?? []).flatMap((f) => {
        const v = data[f.key];
        const t = targetOf(f);
        if (typeof v !== "number" || !t || !isSlip(f, v, true) || isSlip(f, v, false)) return [];
        return f.kind === "counter" ? [`${v} of ${t.value} ${f.unit}`] : f.kind === "amount" ? [`${formatAmount(f, v)} of ${formatAmount(f, t.value)}`] : [];
      });
      return { title: r.title, short };
    });
}

/** The titles of what's still unfinished today (a section with nothing logged, or a floor not reached yet). */
export const openToday = (spec: HabitSpec, entries: Entries, today: string): string[] => openDetails(spec, entries, today).map((o) => o.title);

/**
 * Days in a row with nothing missed: everything planned was done and nothing slipped, "the day
 * overall" included. Not "days you opened the app": a day of skipped sections doesn't extend
 * it. Today only counts once it's complete; while it's still open the run is judged to yesterday.
 * Days marked away are stepped over: they don't count towards the run and don't break it.
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
    if (m.rows.some((r) => r.cells[i].state === "away")) continue; // an away day neither extends the run nor breaks it
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

  const word = (n: number) => (n === 1 ? "miss" : "misses");
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
