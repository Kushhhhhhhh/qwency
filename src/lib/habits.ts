import { EMPTY_ENTRY, weekdayIndex, type Entry } from "./tracker";

// Everything you track in a day lives here. Adding a new thing to track = adding a field
// to a section below; no database change needed (values are stored as JSON per day).

export type Data = Record<string, string | number | string[]>;

export type Option = { id: string; label: string; tone?: "good" | "meh" | "bad" };

type Base = { key: string; label: string; when?: (d: Data) => boolean };
export type Field =
  | (Base & { kind: "single"; options: Option[] })
  | (Base & { kind: "multi"; options: Option[] })
  | (Base & { kind: "counter"; max: number; goal: number; unit: string })
  | (Base & { kind: "amount"; quick: number[] });

export type SectionId = "sleep" | "work" | "gym" | "skin" | "spend" | "day";

export type Section = {
  id: SectionId;
  title: string;
  hint: string;
  fields: Field[];
  done: (e: Entry) => boolean;
};

const has = (d: Data, k: string) => d[k] !== undefined;

export const SECTIONS: Section[] = [
  {
    id: "sleep",
    title: "Sleep",
    hint: "Last night",
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
    done: (e) => has(e.data, "sleep"),
  },
  {
    id: "work",
    title: "Work",
    hint: "Office & focus",
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
        when: (d) => d.work_mode !== "off",
        options: [
          { id: "deep", label: "Deep focus", tone: "good" },
          { id: "okay", label: "Okay", tone: "meh" },
          { id: "scattered", label: "Scattered", tone: "bad" },
        ],
      },
    ],
    done: (e) => has(e.data, "work_mode"),
  },
  {
    id: "gym",
    title: "Gym",
    hint: "Training",
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
        when: (d) => d.gym === "trained",
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
        when: (d) => d.gym === "skipped",
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
    done: (e) => has(e.data, "gym"),
  },
  {
    id: "skin",
    title: "Skin & water",
    hint: "Hydration and routine",
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
    done: (e) => Number(e.data.water ?? 0) > 0 || ((e.data.skin as string[] | undefined)?.length ?? 0) > 0,
  },
  {
    id: "spend",
    title: "Spending",
    hint: "What left your wallet",
    fields: [
      { kind: "amount", key: "spend", label: "Spent today", quick: [50, 100, 250, 500] },
      {
        kind: "single",
        key: "spend_verdict",
        label: "Was it reasonable?",
        when: (d) => Number(d.spend ?? 0) > 0,
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
        when: (d) => Number(d.spend ?? 0) > 0,
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
    done: (e) => has(e.data, "spend"),
  },
  {
    // rendered by a dedicated component (mood + reasons + note), which lives outside `data`
    id: "day",
    title: "The day overall",
    hint: "One honest verdict, plus a note if you want",
    fields: [],
    done: (e) => e.mood !== null,
  },
];

export const TOTAL_SECTIONS = SECTIONS.length;
export const completion = (e: Entry | undefined) =>
  e ? SECTIONS.filter((s) => s.done(e)).length : 0;

// Saturday and Sunday are off for work and gym: they start pre-filled, and you can still
// tap something else if a weekend day is different.
const WEEKEND_DEFAULTS: Data = { work_mode: "off", gym: "rest" };

/** The entry as the UI should see it: weekend defaults filled in for anything not answered yet. */
export function effective(e: Entry | undefined, date: string): Entry {
  const base = e ?? EMPTY_ENTRY;
  if (weekdayIndex(date) < 5) return base;
  return { ...base, data: { ...WEEKEND_DEFAULTS, ...base.data } };
}

/** Progress for grids and strips: a day you never touched stays empty, even on a weekend. */
export function dayProgress(e: Entry | undefined, date: string) {
  return completion(e) > 0 ? completion(effective(e, date)) : 0;
}

const ALL_FIELDS = SECTIONS.flatMap((s) => s.fields);

/** Validate untrusted input against the config above. Used on the server and to prune dependent answers on the client. */
export function sanitize(input: unknown): Data {
  const src = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const out: Data = {};
  for (const f of ALL_FIELDS) {
    if (f.when && !f.when(out)) continue; // dependents come after their parents in the config
    const v = src[f.key];
    if (f.kind === "single") {
      if (typeof v === "string" && f.options.some((o) => o.id === v)) out[f.key] = v;
    } else if (f.kind === "multi") {
      if (Array.isArray(v)) {
        const ids = [...new Set(v)].filter((x): x is string => f.options.some((o) => o.id === x));
        if (ids.length) out[f.key] = ids;
      }
    } else if (f.kind === "counter") {
      if (typeof v === "number" && Number.isFinite(v)) {
        out[f.key] = Math.min(f.max, Math.max(0, Math.round(v)));
      }
    } else if (typeof v === "number" && Number.isFinite(v)) {
      out[f.key] = Math.min(1_000_000, Math.max(0, Math.round(v * 100) / 100));
    }
  }
  return out;
}
