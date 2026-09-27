import { addDays, MOODS, WHY_TAGS, type Entries, type Entry } from "./tracker";
import { whyKey, type FieldSpec, type HabitSpec } from "./spec";

// Turns "misses" — a bad-toned single-choice answer, on any field the user's own spec
// happens to define, or the overall day verdict — into plain-English sentences and a
// reason tally. Deliberately honest about what it can claim: it names a repeated pattern
// and, when there's a real majority reason behind it, says so. It never guesses at *why*
// across unrelated fields (e.g. blaming a Sleep question for a Gym miss) — that would be
// pretending a week of data supports a causal claim it can't actually support.

export type Insight = { key: string; text: string };
export type ReasonCount = { id: string; label: string; n: number };

const ROUGH_LABEL = MOODS.find((m) => m.id === "bad")!.label;
type Miss = { answer: string; reasons: string[] };

function fieldMisses(field: FieldSpec, entries: Entry[]): Miss[] {
  if (field.kind !== "single") return [];
  const badIds = new Set(field.options.filter((o) => o.tone === "bad").map((o) => o.id));
  if (badIds.size === 0) return [];
  const wk = whyKey(field.key);
  const out: Miss[] = [];
  for (const e of entries) {
    const v = e.data[field.key];
    if (typeof v === "string" && badIds.has(v)) {
      const reasons = e.data[wk];
      out.push({ answer: v, reasons: Array.isArray(reasons) ? reasons : [] });
    }
  }
  return out;
}

const dayMisses = (entries: Entry[]): Miss[] =>
  entries.filter((e) => e.mood === "bad").map((e) => ({ answer: "bad", reasons: e.tags }));

type Candidate = { key: string; question: string; misses: Miss[] };

function candidates(spec: HabitSpec, entries: Entry[]): Candidate[] {
  const out: Candidate[] = [];
  const dm = dayMisses(entries);
  if (dm.length) out.push({ key: "__day", question: "Your day overall", misses: dm });
  for (const s of spec.sections) {
    for (const f of s.fields) {
      const misses = fieldMisses(f, entries);
      if (misses.length) out.push({ key: f.key, question: f.label, misses });
    }
  }
  return out;
}

function modeAnswerLabel(field: FieldSpec | undefined, misses: Miss[]): string {
  const counts = new Map<string, number>();
  for (const m of misses) counts.set(m.answer, (counts.get(m.answer) ?? 0) + 1);
  const top = [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
  if (!field || field.kind !== "single") return top === "bad" ? ROUGH_LABEL : top;
  return field.options.find((o) => o.id === top)?.label ?? top;
}

function sentenceFor(question: string, answerLabel: string, misses: Miss[]): string {
  const n = misses.length;
  const days = n === 1 ? "day" : "days";
  const reasonCounts = new Map<string, number>();
  let anyReasons = false;
  for (const m of misses) {
    const seen = new Set(m.reasons);
    if (seen.size) anyReasons = true;
    for (const r of seen) reasonCounts.set(r, (reasonCounts.get(r) ?? 0) + 1);
  }
  const top = [...reasonCounts.entries()].sort((a, b) => b[1] - a[1])[0];

  if (top && top[1] >= Math.ceil(n * 0.6)) {
    const label = WHY_TAGS.find((t) => t.id === top[0])?.label ?? top[0];
    const frequency = top[1] === n ? "every time" : "most times";
    return `${question} was "${answerLabel}" ${n} ${days} this week — "${label}" was the reason ${frequency}.`;
  }
  if (!anyReasons) {
    return `${question} slipped ${n} ${days} this week with no reason logged — tap "why" next time to start spotting the pattern.`;
  }
  return `${question} slipped ${n} ${days} this week for a few different reasons — worth a look below.`;
}

function fieldByKey(spec: HabitSpec, key: string): FieldSpec | undefined {
  return spec.sections.flatMap((s) => s.fields).find((f) => f.key === key);
}

const WEEK = 7;
const MAX_INSIGHTS = 3;

export function weeklyReview(spec: HabitSpec, entries: Entries, today: string) {
  const week = Array.from({ length: WEEK }, (_, i) => entries[addDays(today, -i)]).filter((e): e is Entry => Boolean(e));
  const found = candidates(spec, week);

  const insights: Insight[] = found
    .filter((c) => c.misses.length >= 2)
    .sort((a, b) => b.misses.length - a.misses.length)
    .slice(0, MAX_INSIGHTS)
    .map((c) => {
      const field = c.key === "__day" ? undefined : fieldByKey(spec, c.key);
      const answer = modeAnswerLabel(field, c.misses);
      return { key: c.key, text: sentenceFor(c.question, answer, c.misses) };
    });

  const reasons = reasonTally(spec, entries, addDays(today, -(WEEK - 1))).slice(0, 5);

  return { insights, reasons };
}

/** Every reason tag logged (day verdict or any field-level miss), optionally scoped to `since`. */
export function reasonTally(spec: HabitSpec, entries: Entries, since?: string): ReasonCount[] {
  const pool = (since ? Object.entries(entries).filter(([k]) => k >= since) : Object.entries(entries)).map(([, e]) => e);
  const counts = new Map<string, number>();
  const bump = (tags: string[]) => {
    for (const t of new Set(tags)) counts.set(t, (counts.get(t) ?? 0) + 1);
  };

  for (const e of pool) if (e.mood === "bad") bump(e.tags);
  for (const s of spec.sections) {
    for (const f of s.fields) {
      if (f.kind !== "single") continue;
      const badIds = new Set(f.options.filter((o) => o.tone === "bad").map((o) => o.id));
      if (badIds.size === 0) continue;
      const wk = whyKey(f.key);
      for (const e of pool) {
        const v = e.data[f.key];
        if (typeof v === "string" && badIds.has(v)) {
          const reasons = e.data[wk];
          if (Array.isArray(reasons)) bump(reasons as string[]);
        }
      }
    }
  }

  return WHY_TAGS.map((t) => ({ id: t.id, label: t.label, n: counts.get(t.id) ?? 0 }))
    .filter((r) => r.n > 0)
    .sort((a, b) => b.n - a.n);
}
