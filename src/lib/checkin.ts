import { addDays, shortDate, weekdayIndex, type Entries, type Entry } from "./tracker";
import { buildMirrorOver } from "./mirror";
import { formatAmount, isSlip, optionLabelOf, sectionMissKey, specAt, whyKey, type Data, type FieldSpec, type HabitSpec } from "./spec";

// The Monday check-in. Patterns says "9 gaps have no reason yet. Tap a square to add one", and finding each
// square is the hard part, so once a week the app walks through them with the reason chips you already know.
//
// It only ever asks about LAST week (Monday to Sunday), on Monday, Tuesday and Wednesday: long enough to
// catch a Monday you missed, short enough that "last week" is still true. Gaps are grouped so you're asked
// as little as possible: a day where several sections weren't logged is one question, not five. Every
// answer is saved exactly where Today would have saved it, so Patterns can't tell the difference.

/** Weekday index (Monday = 0) of the last day it is offered. */
export const CHECKIN_LAST_DAY = 2;

/** Last week's Monday to Sunday, if today is a day the check-in is offered. */
export function checkinWeek(today: string): { monday: string; sunday: string; dates: string[] } | null {
  const w = weekdayIndex(today);
  if (w > CHECKIN_LAST_DAY) return null;
  const monday = addDays(today, -w - 7);
  return { monday, sunday: addDays(monday, 6), dates: Array.from({ length: 7 }, (_, i) => addDays(monday, i)) };
}

/** What is remembered once a week's check-in is done or waved away. */
export const weekToken = (monday: string) => `w${monday}`;

/** One thing that didn't happen and has no reason yet. */
export type Gap = {
  /** the section's id, or "__day" for the day verdict */
  row: string;
  title: string;
  /** in words: "Skipped", "5 of 8 glasses", "Not logged" */
  what: string;
  /** the question that slipped (its reason is stored beside it) */
  field?: string;
};

/**
 * One question to ask. "blank": a day where sections weren't logged (one reason covers them all).
 * "slip": a section whose answer fell on the wrong side of its line. "day": a Rough verdict with no reason.
 */
export type Step = { kind: "blank" | "slip" | "day"; date: string; gaps: Gap[] };

export type Checkin = {
  monday: string;
  sunday: string;
  planned: number;
  done: number;
  /** every gap last week, explained or not */
  gaps: number;
  /** the gaps that can be asked about and have no reason yet */
  open: number;
  steps: Step[];
};

function describeSlip(f: FieldSpec, v: Data[string] | undefined): string {
  if (f.kind === "single" && typeof v === "string") return optionLabelOf(f, v);
  if (typeof v === "number") {
    if (f.kind === "counter") return `${v} of ${f.goal} ${f.unit}`;
    if (f.kind === "amount" && f.target) return `${formatAmount(f, v)}, ${f.target.op === "atMost" ? "over" : "under"} ${formatAmount(f, f.target.value)}`;
  }
  return f.label;
}

/**
 * Last week, and what's left to explain. Null when it isn't Monday to Wednesday, nothing was planned last
 * week, or every gap already has a reason (or a note). A day verdict nobody gave has no kind of reason to
 * give, so it is never asked about.
 */
export function buildCheckin(spec: HabitSpec, entries: Entries, today: string): Checkin | null {
  const week = checkinWeek(today);
  if (!week) return null;
  const m = buildMirrorOver(spec, entries, today, week.dates);
  if (m.startedOn === null || m.totals.planned === 0) return null;
  const rows = new Map(m.rows.map((r) => [r.id, r]));

  const steps: Step[] = [];
  week.dates.forEach((date, i) => {
    // a gap that already has a reason or a note is explained: leave it be
    const unexplained = (id: string) => {
      const c = rows.get(id)?.cells[i];
      return c && c.reasons.length === 0 && c.note.length === 0 ? c : undefined;
    };
    const then = specAt(spec, date);
    const data = entries[date]?.data ?? {};
    const blanks: Gap[] = [];
    const slips: Step[] = [];
    spec.sections.forEach((s, si) => {
      const c = unexplained(s.id);
      if (!c) return;
      if (c.state === "blank") blanks.push({ row: s.id, title: s.title, what: "Not logged" });
      else if (c.state === "slipped") {
        const f = then.sections[si].fields.find((x) => isSlip(x, data[x.key], true));
        if (f) slips.push({ kind: "slip", date, gaps: [{ row: s.id, title: s.title, what: describeSlip(f, data[f.key]), field: f.key }] });
      }
    });
    if (blanks.length) steps.push({ kind: "blank", date, gaps: blanks });
    steps.push(...slips);
    if (unexplained("__day")?.state === "slipped") steps.push({ kind: "day", date, gaps: [{ row: "__day", title: "The day overall", what: "A rough day" }] });
  });

  const open = steps.reduce((n, s) => n + s.gaps.length, 0);
  if (open === 0) return null;
  return { monday: week.monday, sunday: week.sunday, planned: m.totals.planned, done: m.totals.done, gaps: m.totals.gaps, open, steps };
}

/** "Mon, Sep 28 – Sun, Oct 4" */
export const weekWords = (c: Pick<Checkin, "monday" | "sunday">) => `${shortDate(c.monday)} – ${shortDate(c.sunday)}`;

/** Where a step's reasons live. The same keys Today writes, so Patterns reads them as it always has. */
export type ReasonWrite = { tags: string[] } | { set: Data; remove: string[] };

export function reasonWrite(step: Step, tags: string[]): ReasonWrite {
  if (step.kind === "day") return { tags };
  const set: Data = {};
  const remove: string[] = [];
  for (const g of step.gaps) {
    const key = step.kind === "blank" ? sectionMissKey(g.row) : whyKey(g.field ?? g.row);
    if (tags.length) set[key] = tags;
    else remove.push(key);
  }
  return { set, remove };
}

/** The reasons a step currently has (read from its first gap: a group is always written together). */
export function reasonTags(entry: Entry | undefined, step: Step): string[] {
  if (step.kind === "day") return entry?.tags ?? [];
  const g = step.gaps[0];
  const v = entry?.data[step.kind === "blank" ? sectionMissKey(g.row) : whyKey(g.field ?? g.row)];
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
}
