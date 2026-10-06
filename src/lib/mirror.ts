import { addDays, WHY_TAGS, type Entries, type Entry } from "./tracker";
import {
  awayOf,
  breakdownOf,
  formatAmount,
  isCustom,
  isExpected,
  isSlip,
  optionLabelOf,
  scheduleLabel,
  sectionDone,
  sectionMissKey,
  sectionNoteKey,
  slipRules,
  specAt,
  splitKey,
  startedOn,
  whyKey,
  EVERY_DAY,
  type AwayReason,
  type Data,
  type FieldSpec,
  type HabitSpec,
  type SectionSpec,
} from "./spec";

// The Patterns page is a mirror, not a scoreboard. For every section and every day it asks
// three plain questions and reports the answers without adjectives:
//
//   Reality  what actually happened            (done)
//   Gap      what was planned but didn't       (slipped = an answer on the wrong side of the line
//                                                          you drew: a bad option, a limit, a floor;
//                                               blank   = nothing logged)
//   Reason   why, in your own words or taps    (reason tags, follow-up answers, notes)
//
// "Planned" comes from each section's schedule. Days before you started, before a section
// existed, or on days a section isn't scheduled are never counted, and today's unanswered
// sections are "open", not missed — the day isn't over. A day marked away (sick, travelling,
// resting) isn't judged at all: everything on it is "away", or "extra" if you logged it anyway.

export type CellState = "done" | "slipped" | "blank" | "open" | "off" | "extra" | "away";
export type Cell = { date: string; state: CellState; reasons: string[]; note: string };
export type ReasonCount = { label: string; n: number };

export type RowMirror = {
  id: string;
  title: string;
  icon: string;
  schedule: string;
  /** what counts as a slip here, in words; empty means nothing in this section can slip */
  rules: string[];
  /** when a rule here last changed, if that's inside the window: earlier days keep the old rule */
  rulesChangedOn?: string;
  /** where a number went, from the optional per-pick amounts ("Food ₹450"), biggest first */
  where: { label: string; amount: string }[];
  cells: Cell[];
  planned: number;
  done: number;
  slipped: number;
  blank: number;
  gaps: number;
  /** gaps that have at least one reason or a note attached */
  explained: number;
  unexplained: number;
  reasons: ReasonCount[];
  notes: { date: string; text: string }[];
};

export type Mirror = {
  windowDays: number;
  startedOn: string | null;
  totals: { planned: number; done: number; slipped: number; blank: number; gaps: number; explained: number; unexplained: number };
  reasons: ReasonCount[];
  rows: RowMirror[];
  /** the days in this window marked away (after you started), oldest first */
  away: { date: string; reason: AwayReason }[];
};

const whyLabel = (id: string) => WHY_TAGS.find((t) => t.id === id)?.label ?? id;
const strings = (v: unknown): string[] => (Array.isArray(v) ? (v as unknown[]).filter((x): x is string => typeof x === "string") : []);

/**
 * Reasons behind a slip: the reason chips tapped for it, plus the answer to any dedicated
 * follow-up ("What stopped you?" only appears when Gym = Skipped), so a reason you already
 * gave once is never reported as missing.
 */
function reasonsForSlip(spec: HabitSpec, entry: Entry, field: FieldSpec, value: Data[string]): string[] {
  const out: string[] = strings(entry.data[whyKey(field.key)]).map(whyLabel);
  if (typeof value !== "string") return out; // a number has no follow-up option to read
  for (const g of spec.sections.flatMap((s) => s.fields)) {
    if (!g.showIf || !("equals" in g.showIf) || g.showIf.field !== field.key || g.showIf.equals !== value) continue;
    const a = entry.data[g.key];
    if (typeof a === "string") out.push(optionLabelOf(g, a));
    else for (const id of strings(a)) out.push(optionLabelOf(g, id));
  }
  return out;
}

const dedupe = (labels: string[]) => {
  const seen = new Set<string>();
  return labels.filter((l) => {
    const k = l.toLowerCase();
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
};

function sectionCell(spec: HabitSpec, s: SectionSpec, date: string, entry: Entry | undefined, today: string, started: string): Cell {
  const noteRaw = entry?.data[sectionNoteKey(s.id)];
  const note = typeof noteRaw === "string" ? noteRaw.trim() : "";
  const answered = Boolean(entry && sectionDone(entry, s));

  // an away day isn't judged: what was planned simply isn't counted, what was logged still shows
  if (date >= started && awayOf(entry)) return { date, state: answered ? "extra" : "away", reasons: [], note };

  if (!isExpected(s, date, started)) return { date, state: answered ? "extra" : "off", reasons: [], note };

  if (!answered || !entry) {
    if (date === today) return { date, state: "open", reasons: [], note };
    return { date, state: "blank", reasons: dedupe(strings(entry?.data[sectionMissKey(s.id)]).map(whyLabel)), note };
  }

  const dayOver = date < today;
  const reasons: string[] = [];
  let slipped = false;
  let pending = false;
  for (const f of s.fields) {
    const v = entry.data[f.key];
    if (isSlip(f, v, dayOver)) {
      slipped = true;
      reasons.push(...reasonsForSlip(spec, entry, f, v));
    } else if (!dayOver && isSlip(f, v, true)) {
      pending = true; // a floor not reached yet, with the day still running
    }
  }
  return { date, state: slipped ? "slipped" : pending ? "open" : "done", reasons: dedupe(reasons), note };
}

/** Why sections weren't logged that day ("Forgot"): a day with no verdict is explained by the same reasons. */
const missedReasons = (entry: Entry | undefined) =>
  Object.entries(entry?.data ?? {})
    .filter(([k]) => k.endsWith("_missed"))
    .flatMap(([, v]) => strings(v).map(whyLabel));

/** "The day overall" is expected every day: Good/Okay are reality, Rough is a slip, empty is a blank. */
function dayCell(date: string, entry: Entry | undefined, today: string, started: string): Cell {
  const note = entry?.note.trim() ?? "";
  if (date < started) return { date, state: "off", reasons: [], note };
  if (awayOf(entry)) return { date, state: "away", reasons: [], note }; // the verdict isn't judged on an away day
  if (!entry || entry.mood === null) return { date, state: date === today ? "open" : "blank", reasons: date === today ? [] : dedupe(missedReasons(entry)), note };
  if (entry.mood === "bad") return { date, state: "slipped", reasons: dedupe(entry.tags.map(whyLabel)), note };
  return { date, state: "done", reasons: [], note };
}

/** Adds up the optional per-pick amounts over the window. Empty when nobody split anything. */
function whereItWent(spec: HabitSpec, s: SectionSpec, dates: string[], entries: Entries): RowMirror["where"] {
  const tally = new Map<string, { label: string; total: number; format: (n: number) => string }>();
  for (const f of s.fields) {
    const parent = breakdownOf(spec, f);
    if (!parent || f.kind !== "multi") continue;
    for (const d of dates) {
      const data = entries[d]?.data;
      if (!data) continue;
      for (const id of strings(data[f.key])) {
        const v = data[splitKey(f.key, id)];
        if (typeof v !== "number" || v <= 0) continue;
        // a day-only pick ("Haircut") adds up across days by its words, whatever case it was typed in
        const label = optionLabelOf(f, id);
        const k = isCustom(id) ? `${f.key}:~${label.toLowerCase()}` : `${f.key}:${id}`;
        tally.set(k, { label: tally.get(k)?.label ?? label, total: (tally.get(k)?.total ?? 0) + v, format: (n) => formatAmount(parent, n) });
      }
    }
  }
  return [...tally.values()]
    .sort((a, b) => b.total - a.total)
    .slice(0, 5)
    .map((t) => ({ label: t.label, amount: t.format(Math.round(t.total * 100) / 100) }));
}

/** The newest day a rule in this section took effect (the day after a past rule ended), if any. */
function lastRuleChange(s: SectionSpec): string | undefined {
  const ends = [...(s.past ?? []), ...s.fields.flatMap((f) => f.past ?? [])].map((p) => p.until).sort();
  return ends.length ? addDays(ends[ends.length - 1], 1) : undefined;
}

function summarize(
  meta: Pick<RowMirror, "id" | "title" | "icon" | "schedule" | "rules" | "where" | "rulesChangedOn">,
  cells: Cell[],
): RowMirror {
  const count = (st: CellState) => cells.filter((c) => c.state === st).length;
  const done = count("done");
  const slipped = count("slipped");
  const blank = count("blank");
  const gapCells = cells.filter((c) => c.state === "slipped" || c.state === "blank");
  const explained = gapCells.filter((c) => c.reasons.length > 0 || c.note.length > 0).length;

  const tally = new Map<string, ReasonCount>();
  for (const c of gapCells) {
    for (const label of c.reasons) {
      const k = label.toLowerCase();
      tally.set(k, { label: tally.get(k)?.label ?? label, n: (tally.get(k)?.n ?? 0) + 1 }); // first spelling wins
    }
  }

  return {
    ...meta,
    cells,
    planned: done + slipped + blank,
    done,
    slipped,
    blank,
    gaps: slipped + blank,
    explained,
    unexplained: gapCells.length - explained,
    reasons: [...tally.values()].sort((a, b) => b.n - a.n),
    notes: gapCells
      .filter((c) => c.note.length > 0)
      .slice(-2)
      .reverse()
      .map((c) => ({ date: c.date, text: c.note })),
  };
}

/** The last `windowDays` days, ending today. */
export function buildMirror(spec: HabitSpec, entries: Entries, today: string, windowDays: number): Mirror {
  const dates = Array.from({ length: windowDays }, (_, i) => addDays(today, -(windowDays - 1 - i)));
  return buildMirrorOver(spec, entries, today, dates);
}

/** The same mirror over any run of dates, e.g. a calendar month (never later than today). */
export function buildMirrorOver(spec: HabitSpec, entries: Entries, today: string, dates: string[]): Mirror {
  const started = startedOn(entries, spec);
  const from = started ?? today;
  const windowDays = dates.length;

  // every day is judged by the spec as it was that day, so changing a rule today never
  // rewrites last month (see specAt)
  const rows: RowMirror[] = spec.sections.map((s, i) => {
    const changed = lastRuleChange(s);
    return summarize(
      {
        id: s.id,
        title: s.title,
        icon: s.icon,
        schedule: scheduleLabel(s.days),
        rules: slipRules(s),
        where: whereItWent(spec, s, dates, entries),
        ...(changed && changed > dates[0] ? { rulesChangedOn: changed } : {}),
      },
      dates.map((d) => {
        const then = specAt(spec, d);
        return sectionCell(then, then.sections[i], d, entries[d], today, from);
      }),
    );
  });
  rows.push(
    summarize(
      { id: "__day", title: "The day overall", icon: "sun", schedule: scheduleLabel(EVERY_DAY), rules: ["Rough"], where: [] },
      dates.map((d) => dayCell(d, entries[d], today, from)),
    ),
  );

  // gaps first — that's what the page is for — otherwise keep the order you set up
  const order = new Map(rows.map((r, i) => [r.id, i]));
  rows.sort((a, b) => b.gaps - a.gaps || order.get(a.id)! - order.get(b.id)!);

  const sum = (f: (r: RowMirror) => number) => rows.reduce((a, r) => a + f(r), 0);
  const tally = new Map<string, ReasonCount>();
  for (const r of rows) {
    for (const rc of r.reasons) {
      const k = rc.label.toLowerCase();
      tally.set(k, { label: tally.get(k)?.label ?? rc.label, n: (tally.get(k)?.n ?? 0) + rc.n });
    }
  }

  return {
    windowDays,
    startedOn: started,
    totals: {
      planned: sum((r) => r.planned),
      done: sum((r) => r.done),
      slipped: sum((r) => r.slipped),
      blank: sum((r) => r.blank),
      gaps: sum((r) => r.gaps),
      explained: sum((r) => r.explained),
      unexplained: sum((r) => r.unexplained),
    },
    reasons: [...tally.values()].sort((a, b) => b.n - a.n),
    rows,
    away: dates.flatMap((d) => {
      const reason = awayOf(entries[d]);
      return reason && d >= from && d <= today ? [{ date: d, reason }] : [];
    }),
  };
}
