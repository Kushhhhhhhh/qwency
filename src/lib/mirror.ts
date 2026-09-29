import { addDays, WHY_TAGS, type Entries, type Entry } from "./tracker";
import {
  isExpected,
  scheduleLabel,
  sectionDone,
  sectionMissKey,
  sectionNoteKey,
  startedOn,
  toneOfValue,
  whyKey,
  EVERY_DAY,
  type FieldSpec,
  type HabitSpec,
  type SectionSpec,
} from "./spec";

// The Patterns page is a mirror, not a scoreboard. For every section and every day it asks
// three plain questions and reports the answers without adjectives:
//
//   Reality  what actually happened            (done)
//   Gap      what was planned but didn't       (slipped = you logged a bad-toned answer,
//                                               blank   = nothing logged)
//   Reason   why, in your own words or taps    (reason tags, follow-up answers, notes)
//
// "Planned" comes from each section's schedule. Days before you started, before a section
// existed, or on days a section isn't scheduled are never counted, and today's unanswered
// sections are "open", not missed — the day isn't over.

export type CellState = "done" | "slipped" | "blank" | "open" | "off" | "extra";
export type Cell = { date: string; state: CellState; reasons: string[]; note: string };
export type ReasonCount = { label: string; n: number };

export type RowMirror = {
  id: string;
  title: string;
  icon: string;
  schedule: string;
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
};

const whyLabel = (id: string) => WHY_TAGS.find((t) => t.id === id)?.label ?? id;
const strings = (v: unknown): string[] => (Array.isArray(v) ? (v as unknown[]).filter((x): x is string => typeof x === "string") : []);

const optionLabel = (f: FieldSpec, id: string) =>
  f.kind === "single" || f.kind === "multi" ? (f.options.find((o) => o.id === id)?.label ?? id) : id;

/**
 * Reasons behind a bad-toned answer: the reason chips tapped for it, plus the answer to any
 * dedicated follow-up ("What stopped you?" only appears when Gym = Skipped), so a reason you
 * already gave once is never reported as missing.
 */
function reasonsForSlip(spec: HabitSpec, entry: Entry, field: FieldSpec, value: string): string[] {
  const out: string[] = strings(entry.data[whyKey(field.key)]).map(whyLabel);
  for (const g of spec.sections.flatMap((s) => s.fields)) {
    if (!g.showIf || !("equals" in g.showIf) || g.showIf.field !== field.key || g.showIf.equals !== value) continue;
    const a = entry.data[g.key];
    if (typeof a === "string") out.push(optionLabel(g, a));
    else for (const id of strings(a)) out.push(optionLabel(g, id));
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

  if (!isExpected(s, date, started)) return { date, state: answered ? "extra" : "off", reasons: [], note };

  if (!answered || !entry) {
    if (date === today) return { date, state: "open", reasons: [], note };
    return { date, state: "blank", reasons: dedupe(strings(entry?.data[sectionMissKey(s.id)]).map(whyLabel)), note };
  }

  const reasons: string[] = [];
  let slipped = false;
  for (const f of s.fields) {
    const v = entry.data[f.key];
    if (typeof v === "string" && toneOfValue(f, v) === "bad") {
      slipped = true;
      reasons.push(...reasonsForSlip(spec, entry, f, v));
    }
  }
  return { date, state: slipped ? "slipped" : "done", reasons: dedupe(reasons), note };
}

/** "The day overall" is expected every day: Good/Okay are reality, Rough is a slip, empty is a blank. */
function dayCell(date: string, entry: Entry | undefined, today: string, started: string): Cell {
  const note = entry?.note.trim() ?? "";
  if (date < started) return { date, state: "off", reasons: [], note };
  if (!entry || entry.mood === null) return { date, state: date === today ? "open" : "blank", reasons: [], note };
  if (entry.mood === "bad") return { date, state: "slipped", reasons: dedupe(entry.tags.map(whyLabel)), note };
  return { date, state: "done", reasons: [], note };
}

function summarize(id: string, title: string, icon: string, schedule: string, cells: Cell[]): RowMirror {
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
      tally.set(k, { label, n: (tally.get(k)?.n ?? 0) + 1 });
    }
  }

  return {
    id,
    title,
    icon,
    schedule,
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

export function buildMirror(spec: HabitSpec, entries: Entries, today: string, windowDays: number): Mirror {
  const started = startedOn(entries, spec);
  const from = started ?? today;
  const dates = Array.from({ length: windowDays }, (_, i) => addDays(today, -(windowDays - 1 - i)));

  const rows: RowMirror[] = spec.sections.map((s) =>
    summarize(s.id, s.title, s.icon, scheduleLabel(s.days), dates.map((d) => sectionCell(spec, s, d, entries[d], today, from))),
  );
  rows.push(summarize("__day", "The day overall", "sun", scheduleLabel(EVERY_DAY), dates.map((d) => dayCell(d, entries[d], today, from))));

  // gaps first — that's what the page is for — otherwise keep the order you set up
  const order = new Map(rows.map((r, i) => [r.id, i]));
  rows.sort((a, b) => b.gaps - a.gaps || order.get(a.id)! - order.get(b.id)!);

  const sum = (f: (r: RowMirror) => number) => rows.reduce((a, r) => a + f(r), 0);
  const tally = new Map<string, ReasonCount>();
  for (const r of rows) {
    for (const rc of r.reasons) {
      const k = rc.label.toLowerCase();
      tally.set(k, { label: rc.label, n: (tally.get(k)?.n ?? 0) + rc.n });
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
  };
}
