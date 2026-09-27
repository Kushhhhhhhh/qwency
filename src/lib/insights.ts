import { addDays } from "./tracker";
import type { Entries, Entry } from "./tracker";
import type { FieldSpec, HabitSpec, Tone } from "./spec";

// Turns whatever fields a *particular* user's spec happens to define into a handful of
// "Your numbers" tiles — no hardcoded field names. Two people with completely different
// setups (or the same person after editing theirs) both get tiles that make sense for them,
// derived the same mechanical way from each field's kind. Every tile carries which section
// it came from and a plain-English line saying what was actually calculated, so the number
// is never a mystery.

export type Tile = { key: string; section: string; question: string; value: string; tone?: Tone; context: string };

const WINDOW_DAYS = 30;
const MAX_TILES = 9;
const NOT_LOGGED = `not logged in the last ${WINDOW_DAYS} days`;

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

function tileFor(field: FieldSpec, sectionTitle: string, entries: Entry[]): Tile {
  const base = { key: field.key, section: sectionTitle, question: field.label };

  if (field.kind === "single" || field.kind === "multi") {
    if (field.kind === "single") {
      const values = entries.map((e) => e.data[field.key]).filter((v): v is string => typeof v === "string");
      if (values.length === 0) return { ...base, value: "—", context: NOT_LOGGED };

      // Always "what did you pick most", whether or not the options carry a tone — consistent
      // across every choice field, rather than a separate "% good" framing that's confusing
      // when the most common answer isn't a good one (e.g. "0% good" reads like an error).
      const counts = new Map<string, number>();
      for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
      const [topId, n] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
      const top = field.options.find((o) => o.id === topId);
      const pct = Math.round((n / values.length) * 100);
      return {
        ...base,
        value: `${top?.label ?? topId} · ${pct}%`,
        tone: top?.tone,
        context: `most picked answer, ${values.length} day${values.length === 1 ? "" : "s"} logged`,
      };
    }

    const counts = entries
      .map((e) => e.data[field.key])
      .filter((v): v is string[] => Array.isArray(v))
      .map((v) => v.length);
    if (counts.length === 0) return { ...base, value: "—", context: NOT_LOGGED };
    return {
      ...base,
      value: mean(counts).toFixed(1),
      context: `avg picked per day, ${counts.length} day${counts.length === 1 ? "" : "s"} logged`,
    };
  }

  if (field.kind === "counter") {
    const values = entries.map((e) => e.data[field.key]).filter((v): v is number => typeof v === "number");
    if (values.length === 0) return { ...base, value: "—", context: NOT_LOGGED };
    return {
      ...base,
      value: `${mean(values).toFixed(1)} ${field.unit}`,
      context: `average per day, ${values.length} day${values.length === 1 ? "" : "s"} logged`,
    };
  }

  // amount — a sum, not "today's" value, even though the question itself asks about one day
  const values = entries.map((e) => e.data[field.key]).filter((v): v is number => typeof v === "number");
  if (values.length === 0) return { ...base, value: "—", context: NOT_LOGGED };
  const total = values.reduce((a, b) => a + b, 0);
  return {
    ...base,
    value: `${field.prefix}${total.toLocaleString()}${field.suffix ? ` ${field.suffix}` : ""}`,
    context: `total added up, last ${WINDOW_DAYS} days`,
  };
}

/**
 * Which fields get a tile, when there isn't room for all of them: one field per *section*
 * first — so a new section (Meals, say) always earns a tile before an older section (Gym)
 * gets a second one — then a second field per section if there's still room, and so on.
 * Plain "first N fields in spec order" would let whichever sections were defined first
 * (yours, since you're the default seed) permanently crowd out anything added later.
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
