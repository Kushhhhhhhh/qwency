import { ICON_IDS, DEFAULT_ICON } from "./icons";
import { EMPTY_ENTRY, weekdayIndex, type Entry } from "./tracker";

// What a single day tracks (sleep, work, gym, water, spending, ...) is *your* choice, stored
// as one spec per user, edited with the screen in components/setup.tsx. This file defines the
// shape of a spec, a safe default to seed new users with, and the two functions that keep any
// spec — hand-edited now, maybe AI-generated later — from turning into broken or unsafe UI:
// `sanitizeSpec` (validate a spec someone is about to save) and `sanitizeData` (bound a day's
// answers generically, without needing to know the exact spec that produced them).

export type Data = Record<string, string | number | string[]>;

export type Tone = "good" | "meh" | "bad";
export type OptionSpec = { id: string; label: string; tone?: Tone };

export type Condition =
  | { field: string; equals: string }
  | { field: string; notEquals: string }
  | { field: string; greaterThanZero: true };

type Base = { key: string; label: string; showIf?: Condition };
export type FieldSpec =
  | (Base & { kind: "single"; options: OptionSpec[] })
  | (Base & { kind: "multi"; options: OptionSpec[] })
  | (Base & { kind: "counter"; max: number; goal: number; unit: string })
  | (Base & { kind: "amount"; quick: number[]; prefix: string; suffix: string });

export type SectionSpec = { id: string; title: string; hint: string; icon: string; fields: FieldSpec[] };

export type HabitSpec = { sections: SectionSpec[]; weekendDefaults: Data };

// ---- your own setup, and what every new account is seeded with ----

export const DEFAULT_SPEC: HabitSpec = {
  sections: [
    {
      id: "sleep",
      title: "Sleep",
      hint: "Last night",
      icon: "moon",
      fields: [
        {
          kind: "single",
          key: "sleep",
          label: "How long did you sleep?",
          options: [
            { id: "lt5", label: "< 5h" },
            { id: "5-6", label: "5–6h" },
            { id: "6-7", label: "6–7h" },
            { id: "7-8", label: "7–8h" },
            { id: "8+", label: "8h+" },
          ],
        },
      ],
    },
    {
      id: "work",
      title: "Work",
      hint: "Office & focus",
      icon: "briefcase",
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
            { id: "push", label: "Push" },
            { id: "pull", label: "Pull" },
            { id: "legs", label: "Legs" },
            { id: "core", label: "Core" },
            { id: "cardio", label: "Cardio" },
            { id: "other", label: "Other" },
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
  // Saturday and Sunday start pre-filled for these two; tap something else if a weekend
  // day is different. Edit or clear this in Setup.
  weekendDefaults: { work_mode: "off", gym: "rest" },
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

export const sectionDone = (entry: Entry, section: SectionSpec) =>
  section.fields.some((f) => hasValue(entry.data[f.key]));

/** The entry as the UI should see it: weekend defaults filled in for anything not answered yet. */
export function effective(entry: Entry | undefined, date: string, spec: HabitSpec): Entry {
  const base = entry ?? EMPTY_ENTRY;
  if (weekdayIndex(date) < 5 || Object.keys(spec.weekendDefaults).length === 0) return base;
  return { ...base, data: { ...spec.weekendDefaults, ...base.data } };
}

/** "The day overall" is a fixed section every spec gets, on top of the custom ones. */
export const totalSections = (spec: HabitSpec) => spec.sections.length + 1;

export function completion(entry: Entry | undefined, spec: HabitSpec): number {
  if (!entry) return 0;
  const custom = spec.sections.filter((s) => sectionDone(entry, s)).length;
  return custom + (entry.mood !== null ? 1 : 0);
}

/** Progress for grids and strips: a day you never touched stays empty, even on a weekend. */
export function dayProgress(entry: Entry | undefined, date: string, spec: HabitSpec) {
  return completion(entry, spec) > 0 ? completion(effective(entry, date, spec), spec) : 0;
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
  return out;
}

// ---- sanitizing untrusted input ----

const KEY_RE = /^[a-z][a-z0-9_]{0,30}$/;

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
    if (count >= 40 || !KEY_RE.test(key)) continue;
    const v = src[key];
    if (typeof v === "string") {
      if (v.length <= 60) out[key] = v;
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
    return {
      kind: "amount",
      key,
      label,
      quick: quick.length ? quick : [50, 100, 250, 500],
      prefix,
      suffix,
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
    sections.push({ id, title, hint, icon, fields });
  }

  const weekendDefaults: Data = {};
  const rawDefaults = src.weekendDefaults;
  if (rawDefaults && typeof rawDefaults === "object") {
    for (const f of sections.flatMap((s) => s.fields)) {
      if (f.kind !== "single") continue;
      const v = (rawDefaults as Record<string, unknown>)[f.key];
      if (typeof v === "string" && f.options.some((o) => o.id === v)) weekendDefaults[f.key] = v;
    }
  }

  return { sections: sections.length ? sections : DEFAULT_SPEC.sections, weekendDefaults };
}
