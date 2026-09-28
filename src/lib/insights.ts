import { addDays } from "./tracker";
import type { Entries, Entry } from "./tracker";
import type { FieldSpec, HabitSpec, Tone } from "./spec";

// Per-question stat tiles, one per section (fair rotation so a newly added section isn't
// crowded out). Every tile has three pieces: which section it came from, the headline value
// itself, and — instead of a bare percentage — a plain-English sentence saying what that
// value actually is. "Skipped · 50%" reads like a chart; "Skipped, about half the days you
// logged" reads like something you already knew but hadn't said out loud.

export type Tile = { key: string; section: string; value: string; tone?: Tone; context: string };

const WINDOW_DAYS = 30;
const MAX_TILES = 9;
const NOT_LOGGED = `Not logged in the last ${WINDOW_DAYS} days.`;

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

/**
 * A frequency phrase for k occurrences out of n logged days. Deliberately not clinical:
 * "about half the days" beats "50%" for the same reason a friend telling you something
 * beats a spreadsheet cell.
 */
function frequency(k: number, n: number): string {
  if (n === 0) return "";
  if (n === 1) return "on the one day you logged";
  if (k === n) return `every one of the ${n} days you logged`;
  if (k === 1) return `on 1 of the ${n} days you logged`;
  const pct = k / n;
  if (pct >= 0.85) return `almost every day (${k} of ${n})`;
  if (pct >= 0.65) return `most days you logged (${k} of ${n})`;
  if (pct >= 0.55) return `more than half the days (${k} of ${n})`;
  if (pct >= 0.45) return `about half the days (${k} of ${n})`;
  if (pct >= 0.3) return `about a third of the days (${k} of ${n})`;
  return `on ${k} of the ${n} days you logged`;
}

function tileFor(field: FieldSpec, sectionTitle: string, entries: Entry[]): Tile {
  const base = { key: field.key, section: sectionTitle };

  if (field.kind === "single") {
    const values = entries.map((e) => e.data[field.key]).filter((v): v is string => typeof v === "string");
    if (values.length === 0) return { ...base, value: "—", context: NOT_LOGGED };

    const counts = new Map<string, number>();
    for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
    const [topId, n] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
    const top = field.options.find((o) => o.id === topId);
    return {
      ...base,
      value: top?.label ?? topId,
      tone: top?.tone,
      context: `${capitalize(frequency(n, values.length))}.`,
    };
  }

  if (field.kind === "multi") {
    // "average items per day" was a weak stat — the *most-picked item* is what a person can
    // actually recognize about themselves. Falls back to a count if that top item isn't clear.
    const perOption = new Map<string, number>();
    let daysWithAny = 0;
    for (const e of entries) {
      const v = e.data[field.key];
      if (!Array.isArray(v) || v.length === 0) continue;
      daysWithAny++;
      for (const id of new Set(v as string[])) perOption.set(id, (perOption.get(id) ?? 0) + 1);
    }
    if (daysWithAny === 0) return { ...base, value: "—", context: NOT_LOGGED };
    const [topId, n] = [...perOption.entries()].sort((a, b) => b[1] - a[1])[0];
    const top = field.options.find((o) => o.id === topId);
    return {
      ...base,
      value: top?.label ?? topId,
      context: `Your most-picked, ${frequency(n, daysWithAny)}.`,
    };
  }

  if (field.kind === "counter") {
    const values = entries.map((e) => e.data[field.key]).filter((v): v is number => typeof v === "number");
    if (values.length === 0) return { ...base, value: "—", context: NOT_LOGGED };
    const avg = mean(values);
    const goalHits = values.filter((v) => v >= field.goal).length;
    return {
      ...base,
      value: `${avg.toFixed(1)} ${field.unit}`,
      context: `Averaged per day, hit your goal of ${field.goal} ${frequency(goalHits, values.length)}.`,
    };
  }

  // amount
  const values = entries.map((e) => e.data[field.key]).filter((v): v is number => typeof v === "number");
  if (values.length === 0) return { ...base, value: "—", context: NOT_LOGGED };
  const total = values.reduce((a, b) => a + b, 0);
  const nonZero = values.filter((v) => v > 0).length;
  return {
    ...base,
    value: `${field.prefix}${total.toLocaleString()}${field.suffix ? ` ${field.suffix}` : ""}`,
    context: `Total across ${nonZero} ${nonZero === 1 ? "day" : "days"} in the last ${WINDOW_DAYS}.`,
  };
}

const capitalize = (s: string) => (s.length ? s[0].toUpperCase() + s.slice(1) : s);

/**
 * One field per *section* first (so a new section always earns a tile before an older
 * section gets a second one), then a second field per section if there's room. Prevents
 * whichever sections were defined earliest from permanently crowding out newer ones.
 */
function pickFields(spec: HabitSpec): { field: FieldSpec; sectionTitle: string }[] {
  const bySection = spec.sections.map((s) => ({ title: s.title, fields: s.fields }));
  const picked: { field: FieldSpec; sectionTitle: string }[] = [];
  for (let round = 0; picked.length < MAX_TILES; round++) {
    const before = picked.length;
    for (const s of bySection) {
      if (!s.fields[round]) continue;
      picked.push({ field: s.fields[round], sectionTitle: s.title });
      if (picked.length >= MAX_TILES) break;
    }
    if (picked.length === before) break; // every section's fields are exhausted
  }
  return picked;
}

export function statTiles(spec: HabitSpec, entries: Entries, today: string): Tile[] {
  const window = Array.from({ length: WINDOW_DAYS }, (_, i) => entries[addDays(today, -i)]).filter((e): e is Entry => Boolean(e));
  return pickFields(spec).map(({ field, sectionTitle }) => tileFor(field, sectionTitle, window));
}
