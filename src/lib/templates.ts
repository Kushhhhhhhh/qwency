import { EVERY_DAY, WEEKDAYS_ONLY, sanitizeSpec, type FieldSpec, type HabitSpec, type SectionSpec } from "./spec";

// Starting points for a brand-new account. Nobody inherits someone else's setup: they pick the
// parts of their day they care about, and everything stays editable in Setup. Each one already
// says what counts as a slip, so Patterns has something to measure from day one. Ids and keys are
// sanitizer-safe (so they're never rewritten) and keys are unique across templates, so any
// combination can sit in one spec.

export type Template = {
  id: string;
  title: string;
  /** one line on the card, including what counts as missed */
  blurb: string;
  section: SectionSpec;
};

const section = (id: string, title: string, hint: string, icon: string, days: number[], fields: FieldSpec[]): SectionSpec => ({
  id,
  title,
  hint,
  icon,
  days,
  fields,
});

export const TEMPLATES: Template[] = [
  {
    id: "sleep",
    title: "Sleep",
    blurb: "How long you slept. Under 6 hours counts as missed.",
    section: section("sleep", "Sleep", "Last night", "moon", EVERY_DAY, [
      {
        kind: "single",
        key: "sleep",
        label: "How long did you sleep?",
        options: [
          { id: "lt5", label: "< 5h", tone: "bad" },
          { id: "h5_6", label: "5–6h", tone: "bad" },
          { id: "h6_7", label: "6–7h", tone: "good" },
          { id: "h7_8", label: "7–8h", tone: "good" },
          { id: "h8_plus", label: "8h+", tone: "good" },
        ],
      },
    ]),
  },
  {
    id: "move",
    title: "Exercise",
    blurb: "Did you train or move? Skipping counts as missed, with a quick why.",
    section: section("move", "Exercise", "Training or movement", "dumbbell", EVERY_DAY, [
      {
        kind: "single",
        key: "move",
        label: "Did you move your body?",
        options: [
          { id: "trained", label: "Yes", tone: "good" },
          { id: "rest", label: "Rest day", tone: "meh" },
          { id: "skipped", label: "Skipped", tone: "bad" },
        ],
      },
      {
        kind: "single",
        key: "move_skip",
        label: "What stopped you?",
        showIf: { field: "move", equals: "skipped" },
        options: [
          { id: "tired", label: "Tired" },
          { id: "no_time", label: "No time" },
          { id: "not_feeling_it", label: "Not feeling it" },
          { id: "sore", label: "Sore" },
          { id: "sick", label: "Sick" },
          { id: "other", label: "Other" },
        ],
      },
    ]),
  },
  {
    id: "focus",
    title: "Focus & work",
    blurb: "How focused your workday was. Scattered counts as missed.",
    section: section("focus", "Focus & work", "How the work went", "briefcase", WEEKDAYS_ONLY, [
      {
        kind: "single",
        key: "focus",
        label: "How focused were you?",
        options: [
          { id: "deep", label: "Deep focus", tone: "good" },
          { id: "okay", label: "Okay", tone: "meh" },
          { id: "scattered", label: "Scattered", tone: "bad" },
        ],
      },
    ]),
  },
  {
    id: "water",
    title: "Water",
    blurb: "Glasses of water. Under 8 counts as missed once the day is over.",
    section: section("water", "Water", "Stay hydrated", "droplets", EVERY_DAY, [
      { kind: "counter", key: "water", label: "Water", max: 12, goal: 8, unit: "glasses" },
    ]),
  },
  {
    id: "spend",
    title: "Spending",
    blurb: "What you spent, whether it was reasonable, and on what.",
    section: section("spend", "Spending", "What left your wallet", "wallet", EVERY_DAY, [
      { kind: "amount", key: "spend", label: "Spent today", quick: [50, 100, 250, 500], prefix: "", suffix: "" },
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
    ]),
  },
  {
    id: "learn",
    title: "Learning",
    blurb: "Minutes you studied or practised. Under 30 counts as missed.",
    section: section("learn", "Learning", "Study or practice", "book", WEEKDAYS_ONLY, [
      {
        kind: "amount",
        key: "learn_min",
        label: "Minutes today",
        quick: [15, 30, 60, 90],
        prefix: "",
        suffix: "min",
        target: { op: "atLeast", value: 30 },
      },
    ]),
  },
  {
    id: "eating",
    title: "Eating",
    blurb: "How you ate. Off track counts as missed.",
    section: section("eating", "Eating", "How you fed yourself", "utensils", EVERY_DAY, [
      {
        kind: "single",
        key: "eating",
        label: "How did you eat?",
        options: [
          { id: "well", label: "Well", tone: "good" },
          { id: "okay", label: "Okay", tone: "meh" },
          { id: "off_track", label: "Off track", tone: "bad" },
        ],
      },
    ]),
  },
  {
    id: "care",
    title: "Self-care",
    blurb: "Small things you did for yourself. Nothing here counts as missed.",
    section: section("care", "Self-care", "Small things that count", "heart", EVERY_DAY, [
      {
        kind: "multi",
        key: "care",
        label: "What did you do for yourself?",
        options: [
          { id: "skin", label: "Skin routine" },
          { id: "stretch", label: "Stretch" },
          { id: "meditate", label: "Meditate" },
          { id: "outdoors", label: "Time outdoors" },
          { id: "read", label: "Read" },
        ],
      },
    ]),
  },
  {
    id: "screen",
    title: "Screen time",
    blurb: "How much your phone took. A lot counts as missed.",
    section: section("screen", "Screen time", "Phone and scrolling", "smartphone", EVERY_DAY, [
      {
        kind: "single",
        key: "screen",
        label: "How much phone time?",
        options: [
          { id: "little", label: "Little", tone: "good" },
          { id: "some", label: "Some", tone: "meh" },
          { id: "a_lot", label: "A lot", tone: "bad" },
        ],
      },
    ]),
  },
];

/** A starting spec from the templates picked, always in the catalog's order whatever order they were tapped. */
export function buildStarter(ids: string[]): HabitSpec {
  const picked = TEMPLATES.filter((t) => ids.includes(t.id));
  return sanitizeSpec({ sections: picked.map((t) => t.section) });
}
