import { addDays, WHY_TAGS, type Entries, type Entry } from "./tracker";
import { whyKey, type HabitSpec } from "./spec";

// Turns a week's data into a small handful of plain-English observations, ranked and capped.
// The rules the sentences follow are strict on purpose: it will only claim a *pattern*
// (something that repeated 2+ times), it will name a *reason* only when it's a real majority
// (60%+ of the misses tagged it), and cross-field observations are phrased as coincidence
// ("on 2 of those days, X also happened") rather than causation ("X caused Y").
// A week of data does not support causal claims and the phrasing reflects that.

export type Insight = { key: string; text: string; kind: "miss" | "mood" | "cross" | "streak" };
export type ReasonCount = { id: string; label: string; n: number };

const WEEK = 7;
const MAX_INSIGHTS = 4;
const MIN_REPEATS = 2;
const REASON_MAJORITY = 0.6;

// ---- collection ----

type FieldMiss = {
  fieldKey: string;
  sectionTitle: string;
  answerLabel: string;
  dates: string[];
  reasonCounts: Map<string, number>;
  totalReasonTagged: number;
};

type MoodMiss = { dates: string[]; reasonCounts: Map<string, number>; totalReasonTagged: number };

function collectFieldMisses(spec: HabitSpec, dated: [string, Entry][]): FieldMiss[] {
  const out: FieldMiss[] = [];
  for (const s of spec.sections) {
    for (const f of s.fields) {
      if (f.kind !== "single") continue;
      const badOptions = f.options.filter((o) => o.tone === "bad");
      if (badOptions.length === 0) continue;
      type Bucket = { label: string; dates: string[]; reasons: Map<string, number>; tagged: number };
      const byAnswer = new Map<string, Bucket>();
      for (const [date, e] of dated) {
        const v = e.data[f.key];
        if (typeof v !== "string") continue;
        const badOpt = badOptions.find((o) => o.id === v);
        if (!badOpt) continue;
        const bucket: Bucket = byAnswer.get(v) ?? { label: badOpt.label, dates: [], reasons: new Map<string, number>(), tagged: 0 };
        bucket.dates.push(date);
        const reasons = e.data[whyKey(f.key)];
        if (Array.isArray(reasons) && reasons.length > 0) {
          bucket.tagged++;
          for (const r of new Set(reasons as string[])) bucket.reasons.set(r, (bucket.reasons.get(r) ?? 0) + 1);
        }
        byAnswer.set(v, bucket);
      }
      for (const [, b] of byAnswer) {
        out.push({
          fieldKey: f.key,
          sectionTitle: s.title,
          answerLabel: b.label,
          dates: b.dates,
          reasonCounts: b.reasons,
          totalReasonTagged: b.tagged,
        });
      }
    }
  }
  return out;
}

function collectMoodMiss(dated: [string, Entry][]): MoodMiss | null {
  const dates: string[] = [];
  const reasonCounts = new Map<string, number>();
  let totalReasonTagged = 0;
  for (const [date, e] of dated) {
    if (e.mood !== "bad") continue;
    dates.push(date);
    if (e.tags.length > 0) {
      totalReasonTagged++;
      for (const t of new Set(e.tags)) reasonCounts.set(t, (reasonCounts.get(t) ?? 0) + 1);
    }
  }
  return dates.length ? { dates, reasonCounts, totalReasonTagged } : null;
}

// ---- phrasing ----

const whyLabel = (id: string) => WHY_TAGS.find((t) => t.id === id)?.label ?? id;

function topReason(counts: Map<string, number>, totalTagged: number): string | null {
  if (totalTagged === 0) return null;
  const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  if (sorted.length === 0) return null;
  const [id, n] = sorted[0];
  if (n / totalTagged < REASON_MAJORITY) return null;
  return whyLabel(id);
}

function missSentence(m: FieldMiss): string {
  const n = m.dates.length;
  const days = n === 1 ? "day" : "days";
  const reason = topReason(m.reasonCounts, m.totalReasonTagged);
  const head = `${m.sectionTitle}: ${m.answerLabel} on ${n} ${days}`;
  if (reason) {
    const every = m.reasonCounts.get([...m.reasonCounts.entries()].sort((a, b) => b[1] - a[1])[0][0]) === n;
    return `${head} — ${reason} ${every ? "every time" : "most times"}.`;
  }
  if (m.totalReasonTagged === 0) return `${head}. No reason tagged yet — tap "why" next time.`;
  return `${head} — a few different reasons.`;
}

function moodSentence(m: MoodMiss): string {
  const n = m.dates.length;
  const days = n === 1 ? "rough day" : "rough days";
  const reason = topReason(m.reasonCounts, m.totalReasonTagged);
  if (reason) return `${n} ${days} this week — mostly ${reason}.`;
  if (m.totalReasonTagged === 0 && n >= MIN_REPEATS) return `${n} ${days} this week. Tapping a reason helps the pattern emerge.`;
  return `${n} ${days} this week.`;
}

/**
 * "On 2 of those X days, you also Y" — a co-occurrence observation, deliberately phrased
 * as coincidence, never causation. Requires 2+ days of overlap and 60%+ of the smaller set.
 */
function crossSentence(a: { title: string; label: string; dates: string[] }, b: { title: string; label: string; dates: string[] }): string | null {
  const aSet = new Set(a.dates);
  const overlap = b.dates.filter((d) => aSet.has(d));
  if (overlap.length < MIN_REPEATS) return null;
  const smaller = Math.min(a.dates.length, b.dates.length);
  if (overlap.length / smaller < REASON_MAJORITY) return null;
  const days = overlap.length === 1 ? "day" : "days";
  return `On ${overlap.length} of the ${a.title.toLowerCase()} ${a.label.toLowerCase()} ${days}, ${b.title.toLowerCase()} was also ${b.label.toLowerCase()}.`;
}

// ---- public ----

export function weeklyReview(spec: HabitSpec, entries: Entries, today: string) {
  const dated: [string, Entry][] = [];
  for (let i = 0; i < WEEK; i++) {
    const d = addDays(today, -i);
    const e = entries[d];
    if (e) dated.push([d, e]);
  }

  const fieldMisses = collectFieldMisses(spec, dated).filter((m) => m.dates.length >= MIN_REPEATS);
  const moodMiss = collectMoodMiss(dated);

  const insights: Insight[] = [];
  for (const m of fieldMisses) insights.push({ key: `miss-${m.fieldKey}`, text: missSentence(m), kind: "miss" });
  if (moodMiss && moodMiss.dates.length >= MIN_REPEATS) {
    insights.push({ key: "mood", text: moodSentence(moodMiss), kind: "mood" });
  }

  // Cross: only worth pointing out when both sides are already themselves a repeated pattern.
  // Skip mood × field (the day verdict often coincides with a bad-toned field mechanically —
  // e.g. a rough day paired with a skipped gym isn't a coincidence worth flagging).
  for (let i = 0; i < fieldMisses.length; i++) {
    for (let j = i + 1; j < fieldMisses.length; j++) {
      const a = fieldMisses[i];
      const b = fieldMisses[j];
      const text = crossSentence(
        { title: a.sectionTitle, label: a.answerLabel, dates: a.dates },
        { title: b.sectionTitle, label: b.answerLabel, dates: b.dates },
      );
      if (text) insights.push({ key: `cross-${a.fieldKey}-${b.fieldKey}`, text, kind: "cross" });
    }
  }

  // Rank: cross > miss > mood, then by strength (dates count, tiebreak: whichever repeated more).
  const rank: Record<Insight["kind"], number> = { cross: 0, miss: 1, mood: 2, streak: 3 };
  insights.sort((x, y) => rank[x.kind] - rank[y.kind]);

  const reasons = reasonTally(spec, entries, addDays(today, -(WEEK - 1))).slice(0, 5);
  return { insights: insights.slice(0, MAX_INSIGHTS), reasons, daysLogged: dated.length };
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
