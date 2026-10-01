import { REVIEW_NOTE_MAX, addMonths, monthDates, type Entries } from "./tracker";
import { buildMirrorOver } from "./mirror";
import { formatAmount, isExpected, specAt, startedOn, type FieldSpec, type HabitSpec } from "./spec";

// Monthly = direction. A month can hold a few goals, and every one is *measured from what you
// already log*, never ticked by hand, so the mirror stays honest about them:
//
//   days   "Do this section on at least N days"        counted from the same Reality as Patterns
//   total  "Keep a number under / over X this month"   summed from an amount or counter question
//
// Progress is compared with how far through the month you are, in plain words (on pace, behind,
// out of reach), never a score. Stored per month, validated here, judged against each day's own rules.

export const DAY_TARGET = "__day"; // "the day overall": a Good or Okay verdict counts as done
export const MAX_GOALS = 6;

export type GoalInput =
  | { kind: "days"; target: string; days: number }
  | { kind: "total"; field: string; op: "atMost" | "atLeast"; value: number };
export type Goal = GoalInput & { id: string };

export type Review = { outcome: "yes" | "partly" | "no"; note: string };
export type MonthPlan = { goals: Goal[]; review?: Review };
export const EMPTY_PLAN: MonthPlan = { goals: [] };

export const goalKey = (g: GoalInput) => (g.kind === "days" ? `days:${g.target}` : `total:${g.field}`);

/** Smallest unused "g1", "g2", ... */
export function newGoalId(goals: Goal[]) {
  const used = new Set(goals.map((g) => g.id));
  let n = 1;
  while (used.has(`g${n}`)) n++;
  return `g${n}`;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Untrusted input to a safe plan: known shapes only, bounded numbers, no duplicate ids. */
export function sanitizePlan(input: unknown): MonthPlan {
  const src = input && typeof input === "object" ? (input as Record<string, unknown>) : {};
  const goals: Goal[] = [];
  const ids = new Set<string>();
  for (const raw of Array.isArray(src.goals) ? src.goals.slice(0, MAX_GOALS) : []) {
    if (!raw || typeof raw !== "object") continue;
    const g = raw as Record<string, unknown>;
    let id = typeof g.id === "string" && /^[a-z0-9_]{1,12}$/.test(g.id) && !ids.has(g.id) ? g.id : newGoalId(goals);
    if (ids.has(id)) id = newGoalId(goals);
    if (g.kind === "days" && typeof g.target === "string" && g.target.length > 0 && g.target.length <= 31 && typeof g.days === "number" && Number.isFinite(g.days)) {
      goals.push({ id, kind: "days", target: g.target, days: Math.min(31, Math.max(1, Math.round(g.days))) });
    } else if (
      g.kind === "total" &&
      typeof g.field === "string" &&
      g.field.length > 0 &&
      g.field.length <= 31 &&
      (g.op === "atMost" || g.op === "atLeast") &&
      typeof g.value === "number" &&
      Number.isFinite(g.value) &&
      g.value >= 0 &&
      g.value <= 10_000_000
    ) {
      goals.push({ id, kind: "total", field: g.field, op: g.op, value: round2(g.value) });
    } else continue;
    ids.add(id);
  }
  const r = src.review && typeof src.review === "object" ? (src.review as Record<string, unknown>) : null;
  const outcome = r?.outcome;
  const review: Review | undefined =
    outcome === "yes" || outcome === "partly" || outcome === "no"
      ? { outcome, note: typeof r?.note === "string" ? r.note.slice(0, REVIEW_NOTE_MAX) : "" }
      : undefined;
  return { goals, ...(review ? { review } : {}) };
}

/** Anything worth reviewing later: a goal or a focus line. */
export const planHasContent = (plan: MonthPlan | undefined, focus: string) => Boolean(plan?.goals.length) || focus.trim().length > 0;

export type GoalStatus = "reached" | "on-pace" | "behind" | "out-of-reach" | "missed" | "over";

export type GoalView = {
  goal: Goal;
  title: string;
  /** what was aimed at, in words: "at least 16 days", "within ₹15,000" */
  headline: string;
  /** where it stands: "6 of 16 days", "₹6,200 of ₹15,000" */
  progress: string;
  /** 0..1 for the bar */
  fraction: number;
  /** how far through the month (or its planned days) you are, 0..1: where the bar "should" be */
  pace: number | null;
  status: GoalStatus;
  note: string;
};

export const STATUS_WORD: Record<GoalStatus, string> = {
  reached: "Reached",
  "on-pace": "On pace",
  behind: "Behind",
  "out-of-reach": "Out of reach",
  missed: "Missed",
  over: "Over",
};

const numericFields = (spec: HabitSpec) =>
  spec.sections.flatMap((s) => s.fields).filter((f): f is Extract<FieldSpec, { kind: "amount" | "counter" }> => f.kind === "amount" || f.kind === "counter");

/** Questions a total can be kept on, for the goal editor. */
export const totalChoices = (spec: HabitSpec) => numericFields(spec).map((f) => ({ key: f.key, label: f.label, kind: f.kind }));

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);

/** The days a section is planned in this month, each by the rules it had that day. */
function plannedDates(spec: HabitSpec, target: string, dates: string[], started: string) {
  if (target === DAY_TARGET) return dates.filter((d) => d >= started);
  return dates.filter((d) => {
    const s = specAt(spec, d).sections.find((x) => x.id === target);
    return !!s && isExpected(s, d, started);
  });
}

/**
 * Where each goal of a month stands, as of `today`. A goal whose section or question has since
 * been removed is left out (its record stays). For a month that's over, `status` is the verdict.
 */
export function goalViews(spec: HabitSpec, entries: Entries, month: string, today: string, goals: Goal[]): GoalView[] {
  const dates = monthDates(month);
  if (dates[0] > today) return []; // a month that hasn't started has nothing to measure
  const finished = dates[dates.length - 1] < today;
  const upto = dates.filter((d) => d <= today);
  const started = startedOn(entries, spec) ?? today;
  const mirror = buildMirrorOver(spec, entries, today, upto);
  const share = finished ? 1 : upto.length / dates.length; // how far through the month
  const monthGone = Math.round(share * 100);
  const out: GoalView[] = [];

  for (const g of goals) {
    if (g.kind === "days") {
      const row = mirror.rows.find((r) => r.id === g.target);
      const section = spec.sections.find((s) => s.id === g.target);
      if (!row || (g.target !== DAY_TARGET && !section)) continue;

      const planned = plannedDates(spec, g.target, dates, started);
      const elapsed = planned.filter((d) => d < today).length;
      const ahead = planned.filter((d) => d > today).length;
      const todayOpen = row.cells.find((c) => c.date === today)?.state === "open";
      const remaining = finished ? 0 : ahead + (todayOpen ? 1 : 0);
      const done = row.done;
      const needed = Math.max(0, g.days - done);
      const pace = planned.length ? (finished ? 1 : elapsed / planned.length) : null;
      const plural = remaining === 1 ? "day" : "days";

      let status: GoalStatus;
      if (done >= g.days) status = "reached";
      else if (finished) status = "missed";
      else if (needed > remaining) status = "out-of-reach";
      else status = pace !== null && done >= g.days * pace - 0.5 ? "on-pace" : "behind";

      out.push({
        goal: g,
        title: g.target === DAY_TARGET ? "The day overall" : section!.title,
        headline: g.target === DAY_TARGET ? `a Good or Okay day, ${g.days} times` : `at least ${g.days} days`,
        progress: `${done} of ${g.days} days`,
        fraction: Math.min(1, done / g.days),
        pace,
        status,
        note:
          status === "reached"
            ? finished
              ? `Reached with ${done}.`
              : `Done: ${done} of ${g.days}.`
            : status === "missed"
              ? `Finished at ${done} of ${g.days}.`
              : status === "out-of-reach"
                ? `Needs ${needed} more, but only ${remaining} planned ${plural} left.`
                : `Needs ${needed} more in ${remaining} planned ${plural}.`,
      });
      continue;
    }

    const f = numericFields(spec).find((x) => x.key === g.field);
    if (!f) continue;
    const sum = round2(upto.reduce((a, d) => a + num(entries[d]?.data[f.key]), 0));
    const fmt = (n: number) => (f.kind === "amount" ? formatAmount(f, n) : `${n.toLocaleString()} ${f.unit}`);
    const ratio = g.value > 0 ? sum / g.value : sum > 0 ? 1 : 0;

    let status: GoalStatus;
    let note: string;
    if (g.op === "atMost") {
      if (finished) status = sum <= g.value ? "reached" : "over";
      else if (sum > g.value) status = "over";
      else status = ratio <= share + 0.1 ? "on-pace" : "behind";
      note =
        status === "over"
          ? `${fmt(round2(sum - g.value))} over.`
          : finished
            ? `Finished at ${fmt(sum)}.`
            : `${fmt(round2(g.value - sum))} left, ${monthGone}% of the month gone.`;
    } else {
      if (sum >= g.value) status = "reached";
      else if (finished) status = "missed";
      else status = sum >= g.value * share * 0.9 ? "on-pace" : "behind";
      note = status === "reached" ? `Reached with ${fmt(sum)}.` : status === "missed" ? `Finished at ${fmt(sum)}.` : `${fmt(round2(g.value - sum))} to go, ${monthGone}% of the month gone.`;
    }

    out.push({
      goal: g,
      title: f.label,
      headline: g.op === "atMost" ? `within ${fmt(g.value)}` : `at least ${fmt(g.value)}`,
      progress: `${fmt(sum)} of ${fmt(g.value)}`,
      fraction: Math.min(1, ratio),
      pace: share,
      status,
      note,
    });
  }
  return out;
}

/** Two significant figures, rounded up: 14,230 -> 15,000, 842 -> 850. */
function niceUp(n: number) {
  const step = 10 ** Math.max(0, Math.floor(Math.log10(n)) - 1);
  return Math.ceil(n / step) * step;
}

/**
 * One-tap goals drawn from your own setup: "80% of a section's planned days this month" (aim for
 * eight in ten), and a ceiling for each amount you track based on what last month actually came to.
 */
export function suggestGoals(spec: HabitSpec, entries: Entries, month: string, today: string): { label: string; goal: GoalInput }[] {
  const dates = monthDates(month);
  const started = startedOn(entries, spec) ?? today;
  const out: { label: string; goal: GoalInput }[] = [];

  const daysFor = (target: string, title: string) => {
    const planned = plannedDates(spec, target, dates, started).length;
    if (planned < 4) return;
    const days = Math.max(1, Math.round(planned * 0.8));
    out.push({ label: `${title} · ${days} days`, goal: { kind: "days", target, days } });
  };
  for (const s of spec.sections) daysFor(s.id, s.title);
  daysFor(DAY_TARGET, "Good or Okay days");

  const last = monthDates(addMonths(month, -1));
  for (const f of numericFields(spec)) {
    if (f.kind !== "amount") continue;
    const spent = last.reduce((a, d) => a + num(entries[d]?.data[f.key]), 0);
    if (spent <= 0) continue;
    const value = niceUp(spent);
    out.push({ label: `${f.label} · within ${formatAmount(f, value)}`, goal: { kind: "total", field: f.key, op: "atMost", value } });
  }
  return out;
}

/** Last month's goals as this month's starting point (new ids, anything already set skipped). */
export function repeatGoals(from: MonthPlan | undefined, into: MonthPlan): Goal[] {
  const goals = [...into.goals];
  const have = new Set(goals.map(goalKey));
  for (const g of from?.goals ?? []) {
    if (goals.length >= MAX_GOALS || have.has(goalKey(g))) continue;
    goals.push({ ...g, id: newGoalId(goals) });
    have.add(goalKey(g));
  }
  return goals;
}
