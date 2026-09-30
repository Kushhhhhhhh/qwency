import { ICON_IDS, DEFAULT_ICON } from "./icons";
import { DATE_RE, WEEKDAYS, weekdayIndex, type Entries, type Entry } from "./tracker";

// What a single day tracks (sleep, work, gym, water, spending, ...) is *your* choice, stored
// as one spec per user, edited with the screen in components/setup.tsx. This file defines the
// shape of a spec, a safe default to seed new users with, and the two functions that keep any
// spec — hand-edited now, maybe AI-generated later — from turning into broken or unsafe UI:
// `sanitizeSpec` (validate a spec someone is about to save) and `sanitizeData` (bound a day's
// answers generically, without needing to know the exact spec that produced them).

export type Data = Record<string, string | number | string[]>;

export type Tone = "good" | "meh" | "bad";
export type OptionSpec = { id: string; label: string; tone?: Tone };

/** A line drawn on a number: "at most ₹500", "at least 2 hrs". Missing it is a slip. */
export type Target = { op: "atLeast" | "atMost"; value: number };

export type Condition =
  | { field: string; equals: string }
  | { field: string; notEquals: string }
  | { field: string; greaterThanZero: true };

type Base = { key: string; label: string; showIf?: Condition };
export type FieldSpec =
  | (Base & { kind: "single"; options: OptionSpec[] })
  | (Base & { kind: "multi"; options: OptionSpec[] })
  | (Base & { kind: "counter"; max: number; goal: number; unit: string })
  | (Base & { kind: "amount"; quick: number[]; prefix: string; suffix: string; target?: Target });

export type SectionSpec = {
  id: string;
  title: string;
  hint: string;
  icon: string;
  /** Weekdays this section is *expected* on (0 = Mon … 6 = Sun). Everything about "missed" hangs off this. */
  days: number[];
  /** Date the section was added (YYYY-MM-DD). Days before it are never counted as gaps. Absent on older sections. */
  since?: string;
  fields: FieldSpec[];
};

export type HabitSpec = { sections: SectionSpec[] };

// ---- schedules: when a section is expected ----

export const EVERY_DAY = [0, 1, 2, 3, 4, 5, 6];
export const WEEKDAYS_ONLY = [0, 1, 2, 3, 4];
export const WEEKENDS_ONLY = [5, 6];

export type SchedulePreset = "every" | "weekdays" | "weekends" | "custom";

const sameDays = (a: number[], b: number[]) => a.length === b.length && a.every((d, i) => d === b[i]);

export function schedulePreset(days: number[]): SchedulePreset {
  if (sameDays(days, EVERY_DAY)) return "every";
  if (sameDays(days, WEEKDAYS_ONLY)) return "weekdays";
  if (sameDays(days, WEEKENDS_ONLY)) return "weekends";
  return "custom";
}

export function scheduleLabel(days: number[]): string {
  const p = schedulePreset(days);
  if (p === "every") return "Every day";
  if (p === "weekdays") return "Weekdays";
  if (p === "weekends") return "Weekends";
  return days.map((d) => WEEKDAYS[d]).join(", ");
}

// ---- your own setup, and what every new account is seeded with ----

export const DEFAULT_SPEC: HabitSpec = {
  sections: [
    {
      id: "sleep",
      title: "Sleep",
      hint: "Last night",
      icon: "moon",
      days: EVERY_DAY,
      fields: [
        {
          kind: "single",
          key: "sleep",
          label: "How long did you sleep?",
          options: [
            { id: "lt5", label: "< 5h", tone: "bad" },
            { id: "5-6", label: "5–6h", tone: "bad" },
            { id: "6-7", label: "6–7h", tone: "good" },
            { id: "7-8", label: "7–8h", tone: "good" },
            { id: "8+", label: "8h+", tone: "good" },
          ],
        },
      ],
    },
    {
      id: "work",
      title: "Work",
      hint: "Office & focus",
      icon: "briefcase",
      days: WEEKDAYS_ONLY,
      fields: [
        {
          kind: "single",
          key: "work_mode",
          label: "Where did you work?",
          options: [
            { id: "office", label: "Office" },
            { id: "remote", label: "Remote" },
            { id: "off", label: "Day off" },
          ],
        },
        {
          kind: "single",
          key: "work_focus",
          label: "How focused were you?",
          showIf: { field: "work_mode", notEquals: "off" },
          options: [
            { id: "deep", label: "Deep focus", tone: "good" },
            { id: "okay", label: "Okay", tone: "meh" },
            { id: "scattered", label: "Scattered", tone: "bad" },
          ],
        },
      ],
    },
    {
      id: "gym",
      title: "Gym",
      hint: "Training",
      icon: "dumbbell",
      days: WEEKDAYS_ONLY,
      fields: [
        {
          kind: "single",
          key: "gym",
          label: "Did you train?",
          options: [
            { id: "trained", label: "Trained", tone: "good" },
            { id: "rest", label: "Rest day", tone: "meh" },
            { id: "skipped", label: "Skipped", tone: "bad" },
          ],
        },
        {
          kind: "multi",
          key: "gym_type",
          label: "What did you hit?",
          showIf: { field: "gym", equals: "trained" },
          options: [
            { id: "chest", label: "Chest" },
            { id: "shoulders", label: "Shoulders" },
            { id: "biceps", label: "Biceps" },
            { id: "triceps", label: "Triceps" },
            { id: "core", label: "Core" },
            { id: "legs", label: "Legs" },
            { id: "cardio", label: "Cardio" },
          ],
        },
        {
          kind: "single",
          key: "gym_skip",
          label: "What stopped you?",
          showIf: { field: "gym", equals: "skipped" },
          options: [
            { id: "tired", label: "Tired" },
            { id: "no-time", label: "No time" },
            { id: "lazy", label: "Couldn’t be bothered" },
            { id: "sore", label: "Sore" },
            { id: "sick", label: "Sick" },
            { id: "other", label: "Other" },
          ],
        },
      ],
    },
    {
      id: "skin",
      title: "Skin & water",
      hint: "Hydration and routine",
      icon: "droplets",
      days: EVERY_DAY,
      fields: [
        { kind: "counter", key: "water", label: "Water", max: 12, goal: 8, unit: "glasses" },
        {
          kind: "multi",
          key: "skin",
          label: "Skin care",
          options: [
            { id: "wash-am", label: "Face wash AM" },
            { id: "wash-pm", label: "Face wash PM" },
            { id: "moisturizer", label: "Moisturizer" },
            { id: "sunscreen", label: "Sunscreen" },
            { id: "mask", label: "Mask" },
          ],
        },
      ],
    },
    {
      id: "spend",
      title: "Spending",
      hint: "What left your wallet",
      icon: "wallet",
      days: EVERY_DAY,
      fields: [
        { kind: "amount", key: "spend", label: "Spent today", quick: [50, 100, 250, 500], prefix: "₹", suffix: "" },
        {
          kind: "single",
          key: "spend_verdict",
          label: "Was it reasonable?",
          showIf: { field: "spend", greaterThanZero: true },
          options: [
            { id: "reasonable", label: "Reasonable", tone: "good" },
            { id: "meh", label: "Meh", tone: "meh" },
            { id: "wasteful", label: "Wasteful", tone: "bad" },
          ],
        },
        {
          kind: "multi",
          key: "spend_cats",
          label: "On what?",
          showIf: { field: "spend", greaterThanZero: true },
          options: [
            { id: "food", label: "Food" },
            { id: "transport", label: "Transport" },
            { id: "shopping", label: "Shopping" },
            { id: "bills", label: "Bills" },
            { id: "fun", label: "Fun" },
            { id: "other", label: "Other" },
          ],
        },
      ],
    },
  ],
};

// ---- evaluating a spec against a day's data ----

export function fieldVisible(field: FieldSpec, data: Data): boolean {
  const c = field.showIf;
  if (!c) return true;
  const v = data[c.field];
  if ("equals" in c) return v === c.equals;
  if ("notEquals" in c) return v !== c.notEquals; // unanswered (undefined) counts as "not equal"
  return typeof v === "number" && v > 0;
}

function hasValue(v: Data[string] | undefined) {
  if (v === undefined) return false;
  return Array.isArray(v) ? v.length > 0 : true; // a stored 0 (e.g. "No spend") is still an answer
}

// "Why did this slip" reasons for a single-choice field live right alongside its own answer,
// under a companion key — no new column, same generic `data` blob everything else uses.
export const whyKey = (fieldKey: string) => `${fieldKey}_why`;

// Per-section freeform note ("add anything for this section, no matter what happened").
// Same storage trick as the reason tags: a companion key in the `data` blob, keyed by
// the section's id. Server sanitizer treats any *_note key as free text up to SECTION_NOTE_MAX.
export const sectionNoteKey = (sectionId: string) => `${sectionId}_note`;
export const SECTION_NOTE_MAX = 500;

// Why a *scheduled section had nothing logged* (WHY_TAGS ids). Separate from `whyKey`, which
// explains a bad-toned answer — this explains a blank. Cleared automatically once the
// section gets an answer, since it no longer describes anything.
export const sectionMissKey = (sectionId: string) => `${sectionId}_missed`;

/** The tone of whatever a "single" field is currently set to, if any. */
export function toneOfValue(field: FieldSpec, value: Data[string] | undefined): Tone | undefined {
  if (field.kind !== "single" || typeof value !== "string") return undefined;
  return field.options.find((o) => o.id === value)?.tone;
}

/**
 * True when some other field in the spec is already a dedicated follow-up for this exact
 * answer (e.g. "What stopped you?" only appears when Gym = Skipped) — in which case the
 * generic "why did this slip" prompt should stay out of the way instead of asking twice.
 */
export function hasDedicatedFollowUp(spec: HabitSpec, fieldKey: string, value: string): boolean {
  return spec.sections
    .flatMap((s) => s.fields)
    .some((f) => f.showIf && "equals" in f.showIf && f.showIf.field === fieldKey && f.showIf.equals === value);
}

// ---- what counts as a slip ----
//
// One idea drives every gap on the Patterns page: a question *slips* when its answer lands on
// the wrong side of a line you drew. The line is an option you marked bad, a counter's goal
// (a floor), or a limit on a number. Unanswered is never a slip; that's a blank.

/** The line drawn on a number question, if any. A counter's goal is always a floor. */
export function targetOf(field: FieldSpec): Target | undefined {
  if (field.kind === "counter") return { op: "atLeast", value: field.goal };
  if (field.kind === "amount") return field.target;
  return undefined;
}

/**
 * Is this answer on the wrong side of its line? A floor can't be judged while the day is still
 * running (3 of 8 glasses at noon is on its way, not a slip), so it only counts once `dayOver`.
 * A ceiling is broken the moment it's crossed, and a bad-toned option is a slip as soon as it's picked.
 */
export function isSlip(field: FieldSpec, value: Data[string] | undefined, dayOver: boolean): boolean {
  if (field.kind === "single") return toneOfValue(field, value) === "bad";
  if (typeof value !== "number") return false;
  const t = targetOf(field);
  if (!t) return false;
  return t.op === "atMost" ? value > t.value : dayOver && value < t.value;
}

export const formatAmount = (f: Extract<FieldSpec, { kind: "amount" }>, n: number) =>
  `${f.prefix}${n.toLocaleString()}${f.suffix ? ` ${f.suffix}` : ""}`;

/** The section's lines in plain words ("< 5h or 5–6h", "Water under 8 glasses"). Empty = nothing can slip. */
export function slipRules(section: SectionSpec): string[] {
  const out: string[] = [];
  for (const f of section.fields) {
    if (f.kind === "single") {
      const bad = f.options.filter((o) => o.tone === "bad").map((o) => o.label);
      if (bad.length) out.push(bad.join(" or "));
    } else if (f.kind === "counter") {
      out.push(`${f.label} under ${f.goal} ${f.unit}`);
    } else if (f.kind === "amount" && f.target) {
      out.push(`${f.label} ${f.target.op === "atMost" ? "over" : "under"} ${formatAmount(f, f.target.value)}`);
    }
  }
  return out;
}

/** Nothing in this section has a line, so only a missed day can ever show up as a gap. */
export const canSlip = (section: SectionSpec) => slipRules(section).length > 0;

/**
 * Which field in a section should ask "why did this slip?" — at most one, so a day where both
 * the amount and the verdict went wrong doesn't ask twice. Skips answers that already have a
 * dedicated follow-up (Gym = Skipped asks "What stopped you?" itself).
 */
export function whyPromptKey(spec: HabitSpec, section: SectionSpec, data: Data, dayOver: boolean): string | undefined {
  for (const f of section.fields) {
    if (!fieldVisible(f, data)) continue;
    const v = data[f.key];
    if (!isSlip(f, v, dayOver)) continue;
    if (typeof v === "string" && hasDedicatedFollowUp(spec, f.key, v)) continue;
    return f.key;
  }
  return undefined;
}

// ---- splitting a number across your picks ("190 total: food 150, transport 40") ----
//
// No flag to set and nothing to migrate: a multi-choice that only appears once a number is
// above zero ("On what?" after "Spent today") *is* that number's breakdown, so every spec that
// already has the pattern, yours and your friends', gets it. Each pick may carry an optional
// amount, stored as a plain number under a companion key in the same day blob.

export type AmountField = Extract<FieldSpec, { kind: "amount" }>;

export const splitKey = (fieldKey: string, optionId: string) => `${fieldKey}__${optionId}`;

/** The number this multi-choice breaks down, if it's a breakdown at all. */
export function breakdownOf(spec: HabitSpec, field: FieldSpec): AmountField | undefined {
  const c = field.showIf;
  if (field.kind !== "multi" || !c || !("greaterThanZero" in c)) return undefined;
  const parent = spec.sections.flatMap((s) => s.fields).find((f) => f.key === c.field);
  return parent?.kind === "amount" ? parent : undefined;
}

export const sectionDone = (entry: Entry, section: SectionSpec) =>
  section.fields.some((f) => hasValue(entry.data[f.key]));

// ---- what's expected on a given day ----

export const isScheduled = (section: SectionSpec, date: string) => section.days.includes(weekdayIndex(date));
export const scheduledSections = (spec: HabitSpec, date: string) => spec.sections.filter((s) => isScheduled(s, date));

/** Anything answered on any section (scheduled or not), or a day verdict. */
export function hasActivity(entry: Entry | undefined, spec: HabitSpec): boolean {
  if (!entry) return false;
  return entry.mood !== null || spec.sections.some((s) => sectionDone(entry, s));
}

/**
 * The earliest day you logged anything (a note counts). Days before it aren't gaps — you
 * hadn't started yet, and calling them misses would make the first week look like failure.
 */
export function startedOn(entries: Entries, spec: HabitSpec): string | null {
  let first: string | null = null;
  for (const [date, e] of Object.entries(entries)) {
    if (!hasActivity(e, spec) && e.note.trim().length === 0) continue;
    if (first === null || date < first) first = date;
  }
  return first;
}

/** Was this section actually expected on this day? Scheduled, after you started, after it existed. */
export const isExpected = (section: SectionSpec, date: string, started: string) =>
  isScheduled(section, date) && date >= started && (!section.since || date >= section.since);

/** Progress is measured against the plan: scheduled sections + "the day overall", which is always on. */
export const dayTotal = (spec: HabitSpec, date: string) => scheduledSections(spec, date).length + 1;

export function dayDone(entry: Entry | undefined, date: string, spec: HabitSpec): number {
  if (!entry) return 0;
  const custom = scheduledSections(spec, date).filter((s) => sectionDone(entry, s)).length;
  return custom + (entry.mood !== null ? 1 : 0);
}

const allFields = (spec: HabitSpec) => spec.sections.flatMap((s) => s.fields);

/**
 * Drop any answer whose field is no longer visible given the rest of the data (e.g. gym_type
 * after switching Gym to "Skipped"). Client-side only, for instant UI + a clean payload; the
 * server bounds-checks with `sanitizeData` regardless of which fields a given spec defines.
 */
export function pruneHidden(spec: HabitSpec, data: Data): Data {
  const out: Data = {};
  for (const f of allFields(spec)) {
    if (fieldVisible(f, out) && data[f.key] !== undefined) out[f.key] = data[f.key];
  }
  // "why did this slip" tags only make sense while they still explain the current answer:
  // the field is visible and its value is still on the wrong side of its line.
  for (const f of allFields(spec)) {
    const wk = whyKey(f.key);
    if (isSlip(f, out[f.key], true) && data[wk] !== undefined) out[wk] = data[wk];
  }
  // An amount on a pick ("food 150") stands only while that pick is still selected. Unticking it,
  // or zeroing the total so the whole question hides, drops it with no stale numbers left behind.
  for (const f of allFields(spec)) {
    if (!breakdownOf(spec, f)) continue;
    const picked = Array.isArray(out[f.key]) ? (out[f.key] as string[]) : [];
    for (const id of picked) {
      const v = data[splitKey(f.key, id)];
      if (typeof v === "number" && v > 0) out[splitKey(f.key, id)] = v;
    }
  }
  // Section notes travel with the section: kept for any section still in the spec, dropped
  // when a whole section is removed in Setup (which is the same rule field answers follow).
  for (const s of spec.sections) {
    const k = sectionNoteKey(s.id);
    if (typeof data[k] === "string" && (data[k] as string).length > 0) out[k] = data[k];
  }
  // A "why was this blank" reason only stands while the section is still blank.
  for (const s of spec.sections) {
    const mk = sectionMissKey(s.id);
    const answered = s.fields.some((f) => hasValue(out[f.key]));
    if (!answered && data[mk] !== undefined) out[mk] = data[mk];
  }
  return out;
}

// ---- sanitizing untrusted input ----

const KEY_RE = /^[a-z][a-z0-9_]{0,30}$/;
// Stored keys are a field key or section id plus a companion suffix (_why, _note, _missed) or
// `fieldKey__optionId` for a per-pick amount, so they're allowed to run longer than the ids
// they're built from (31 + 2 + 31).
const DATA_KEY_RE = /^[a-z][a-z0-9_]{0,63}$/;

/**
 * Generic, spec-independent bounds check for a day's answers. Deliberately doesn't need to
 * know the caller's current spec (no extra fetch on every tap): it just clamps shape and size.
 * A key that no longer matches any field in the spec simply never gets rendered.
 */
export function sanitizeData(input: unknown): Data {
  const src = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const out: Data = {};
  let count = 0;
  for (const key of Object.keys(src)) {
    if (count >= 120 || !DATA_KEY_RE.test(key)) continue;
    const v = src[key];
    if (typeof v === "string") {
      // any *_note key is free text (bumped from 60 to SECTION_NOTE_MAX); other strings
      // are option ids and stay short.
      const cap = key.endsWith("_note") ? SECTION_NOTE_MAX : 60;
      if (v.length <= cap) out[key] = v;
    } else if (typeof v === "number") {
      if (Number.isFinite(v)) out[key] = Math.min(1_000_000, Math.max(0, Math.round(v * 100) / 100));
    } else if (Array.isArray(v)) {
      const ids = [...new Set(v)].filter((x): x is string => typeof x === "string" && x.length <= 60).slice(0, 20);
      if (ids.length) out[key] = ids;
    } else {
      continue;
    }
    count++;
  }
  return out;
}

export function slugify(text: string, fallback = "item") {
  const s = text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 24);
  return KEY_RE.test(s) ? s : fallback;
}

/** A key/id that doesn't collide with anything already used; mutates `used` to reserve it. */
export function uniqueSlug(text: string, used: Set<string>, fallback = "item") {
  const base = slugify(text, fallback);
  let candidate = base;
  let n = 2;
  while (used.has(candidate)) candidate = `${base}_${n++}`;
  used.add(candidate);
  return candidate;
}

const MAX_SECTIONS = 8;
const MAX_FIELDS = 6;
const MAX_OPTIONS = 8;

// Shared with the editor, so its "add" buttons disable at the same caps this file enforces.
export const LIMITS = { sections: MAX_SECTIONS, fields: MAX_FIELDS, options: MAX_OPTIONS };

const clamp = (s: unknown, max: number) => (typeof s === "string" ? s.trim().slice(0, max) : "");

function sanitizeOptions(input: unknown, usedIds: Set<string>): OptionSpec[] {
  const raw = Array.isArray(input) ? input.slice(0, MAX_OPTIONS) : [];
  const out: OptionSpec[] = [];
  for (const o of raw) {
    if (!o || typeof o !== "object") continue;
    const label = clamp((o as { label?: unknown }).label, 30);
    if (!label) continue;
    const tone = (o as { tone?: unknown }).tone;
    const id =
      typeof (o as { id?: unknown }).id === "string" && KEY_RE.test((o as { id: string }).id)
        ? (o as { id: string }).id
        : uniqueSlug(label, usedIds, `opt${out.length + 1}`);
    usedIds.add(id);
    out.push({ id, label, ...(tone === "good" || tone === "meh" || tone === "bad" ? { tone } : {}) });
  }
  return out;
}

/** A condition may only point at a field key seen earlier in the same spec (no forward/circular refs). */
function sanitizeCondition(input: unknown, seenKeys: Set<string>): Condition | undefined {
  if (!input || typeof input !== "object") return undefined;
  const c = input as Record<string, unknown>;
  const field = typeof c.field === "string" ? c.field : undefined;
  if (!field || !seenKeys.has(field)) return undefined;
  if (typeof c.equals === "string") return { field, equals: c.equals.slice(0, 30) };
  if (typeof c.notEquals === "string") return { field, notEquals: c.notEquals.slice(0, 30) };
  if (c.greaterThanZero === true) return { field, greaterThanZero: true };
  return undefined;
}

function sanitizeField(input: unknown, usedKeys: Set<string>): FieldSpec | undefined {
  if (!input || typeof input !== "object") return undefined;
  const f = input as Record<string, unknown>;
  const label = clamp(f.label, 60);
  if (!label) return undefined;
  const key =
    typeof f.key === "string" && KEY_RE.test(f.key) && !usedKeys.has(f.key) ? f.key : uniqueSlug(label, usedKeys);
  const seenBefore = new Set(usedKeys);
  seenBefore.delete(key); // a field can't depend on itself
  const showIf = sanitizeCondition(f.showIf, seenBefore);
  usedKeys.add(key);

  if (f.kind === "counter") {
    const max = Math.min(60, Math.max(1, Math.round(Number(f.max)) || 10));
    const goal = Math.min(max, Math.max(1, Math.round(Number(f.goal)) || Math.ceil(max / 2)));
    const unit = clamp(f.unit, 20) || "times";
    return { kind: "counter", key, label, max, goal, unit, ...(showIf ? { showIf } : {}) };
  }
  if (f.kind === "amount") {
    const quick = Array.isArray(f.quick)
      ? [...new Set(f.quick)]
          .map((n) => Math.round(Number(n)))
          .filter((n) => Number.isFinite(n) && n > 0 && n <= 100_000)
          .slice(0, 6)
      : [50, 100, 250, 500];
    const prefix = clamp(f.prefix, 6);
    const suffix = clamp(f.suffix, 6);
    const rawTarget = f.target && typeof f.target === "object" ? (f.target as Record<string, unknown>) : {};
    const target: Target | undefined =
      (rawTarget.op === "atLeast" || rawTarget.op === "atMost") &&
      typeof rawTarget.value === "number" &&
      Number.isFinite(rawTarget.value) &&
      rawTarget.value >= 0 &&
      rawTarget.value <= 1_000_000
        ? { op: rawTarget.op, value: Math.round(rawTarget.value * 100) / 100 }
        : undefined;
    return {
      kind: "amount",
      key,
      label,
      quick: quick.length ? quick : [50, 100, 250, 500],
      prefix,
      suffix,
      ...(target ? { target } : {}),
      ...(showIf ? { showIf } : {}),
    };
  }
  const optionIds = new Set<string>();
  const options = sanitizeOptions(f.options, optionIds);
  if (options.length < 2) return undefined; // a choice needs at least two choices
  const kind = f.kind === "multi" ? "multi" : "single";
  return { kind, key, label, options, ...(showIf ? { showIf } : {}) };
}

/**
 * Strict validation for a spec someone is about to save — hand-edited today, possibly
 * AI-generated later. Field kinds, option shapes and limits are a fixed vocabulary; nothing
 * here can inject markup or arbitrary behavior, only pick from it.
 */
export function sanitizeSpec(input: unknown): HabitSpec {
  const src = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const usedSectionIds = new Set<string>();
  const usedKeys = new Set<string>();
  const sections: SectionSpec[] = [];

  const rawSections = Array.isArray(src.sections) ? src.sections.slice(0, MAX_SECTIONS) : [];
  for (const rs of rawSections) {
    if (!rs || typeof rs !== "object") continue;
    const s = rs as Record<string, unknown>;
    const title = clamp(s.title, 40);
    if (!title) continue;
    const hint = clamp(s.hint, 60);
    const icon = typeof s.icon === "string" && ICON_IDS.includes(s.icon) ? s.icon : DEFAULT_ICON;
    const id =
      typeof s.id === "string" && KEY_RE.test(s.id) && !usedSectionIds.has(s.id)
        ? s.id
        : uniqueSlug(title, usedSectionIds, `section${sections.length + 1}`);
    usedSectionIds.add(id);

    const rawFields = Array.isArray(s.fields) ? s.fields.slice(0, MAX_FIELDS) : [];
    const fields: FieldSpec[] = [];
    for (const rf of rawFields) {
      const field = sanitizeField(rf, usedKeys);
      if (field) fields.push(field);
    }
    if (fields.length === 0) continue; // a section with nothing to tap isn't worth keeping

    // Schedule. Specs saved before schedules existed had `weekendDefaults` instead — a section
    // whose answers were pre-filled on weekends was, in effect, a weekdays-only section, so
    // carry that intent over rather than suddenly expecting Gym and Work on Saturdays.
    const legacy = src.weekendDefaults && typeof src.weekendDefaults === "object" ? (src.weekendDefaults as Record<string, unknown>) : {};
    const hadWeekendDefault = fields.some((f) => f.key in legacy);
    const days = sanitizeDays(s.days) ?? (hadWeekendDefault ? WEEKDAYS_ONLY : EVERY_DAY);
    const since = typeof s.since === "string" && DATE_RE.test(s.since) ? s.since : undefined;

    sections.push({ id, title, hint, icon, days, ...(since ? { since } : {}), fields });
  }

  return { sections: sections.length ? sections : DEFAULT_SPEC.sections };
}

function sanitizeDays(input: unknown): number[] | null {
  if (!Array.isArray(input)) return null;
  const days = [...new Set(input.map(Number).filter((n) => Number.isInteger(n) && n >= 0 && n <= 6))].sort((a, b) => a - b);
  return days.length ? days : null;
}
