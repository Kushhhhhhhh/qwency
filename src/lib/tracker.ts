import type { Data } from "./spec";

export type Mood = "good" | "meh" | "bad";

export const MOODS: { id: Mood; label: string; sub: string }[] = [
  { id: "good", label: "Good", sub: "Showed up" },
  { id: "meh", label: "Okay", sub: "Half in" },
  { id: "bad", label: "Rough", sub: "Lost it" },
];

// One shared, fixed vocabulary for "why did this slip" — used for the overall day verdict
// and for any bad-toned answer on a field, anywhere in a user's own custom spec. Fixed for
// everyone (not editable in Setup) so reasons stay comparable across different setups.
export const WHY_TAGS = [
  { id: "tired", label: "Tired" },
  { id: "bad-sleep", label: "Bad sleep" },
  { id: "stress", label: "Stress" },
  { id: "distraction", label: "Distraction" },
  { id: "no-time", label: "No time" },
  { id: "forgot", label: "Forgot" },
  { id: "low-motivation", label: "Low motivation" },
  { id: "triggered", label: "Triggered" },
] as const;

export const NOTE_MAX = 1000;
export const FOCUS_MAX = 120;

export type Entry = { mood: Mood | null; tags: string[]; note: string; data: Data };
export type Entries = Record<string, Entry>;

export const EMPTY_ENTRY: Entry = { mood: null, tags: [], note: "", data: {} };

// ---- date keys (YYYY-MM-DD, calendar dates, no timezone attached) ----

export const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function localKey(d: Date) {
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

const asUTC = (key: string) => new Date(`${key}T00:00:00Z`);

export function addDays(key: string, n: number) {
  const d = asUTC(key);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Monday = 0 … Sunday = 6 */
export function weekdayIndex(key: string) {
  return (asUTC(key).getUTCDay() + 6) % 7;
}

export const monthOf = (key: string) => key.slice(0, 7);

export function daysInMonth(month: string) {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

export function prettyDate(key: string) {
  return asUTC(key).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
}

export function shortDate(key: string) {
  return asUTC(key).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

export const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
