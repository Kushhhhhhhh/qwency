import { EMPTY_ENTRY, type Entries, type Entry } from "./tracker";

// An open app goes stale: the calendar day rolls over under it, and another device may have
// logged things since it loaded. These are the small, pure rules for catching up without ever
// throwing away something that only exists on this screen.

/**
 * The calendar day changed under an open app. Always move "today" forward; move *you* to the
 * new day only when you were looking at "today" and are just coming back to the app. If you're
 * actively on the app past midnight, stay where you are, since you may be finishing last night.
 */
export function rollDay(state: { today: string; selected: string }, now: string, follow: boolean) {
  if (now === state.today) return state;
  return { today: now, selected: follow && state.selected === state.today ? now : state.selected };
}

/** Same data, whatever order a database happened to return its keys in. `skip` leaves keys out entirely. */
export function canon(v: unknown, ...skip: string[]): string {
  return JSON.stringify(v, (_k, val) =>
    val && typeof val === "object" && !Array.isArray(val)
      ? Object.fromEntries(
          Object.entries(val)
            .filter(([k]) => !skip.includes(k))
            .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)),
        )
      : val,
  );
}

/**
 * Same data, whatever order the keys came in (a missing key and an `undefined` one are the same).
 * Answers the same question as comparing two `canon()` strings, without building and sorting a
 * string for every object, which is what makes checking a whole window of days cheap.
 */
export function same(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) return false;
  if (Array.isArray(a) || Array.isArray(b)) {
    return Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((v, i) => same(v, b[i]));
  }
  const x = a as Record<string, unknown>;
  const y = b as Record<string, unknown>;
  for (const k in x) if (x[k] !== undefined && !same(x[k], y[k])) return false;
  for (const k in y) if (y[k] !== undefined && x[k] === undefined) return false;
  return true;
}

export const sameEntry = (a: Entry | undefined, b: Entry | undefined) => same(a ?? EMPTY_ENTRY, b ?? EMPTY_ENTRY);

/**
 * Fold a fresh read from the server into what's on screen. The server wins, except for days in
 * `keep`: days whose last save failed, where this screen holds the only copy of what you logged.
 * When nothing actually differs this returns `local` itself (and a day that didn't change keeps its
 * object), so the screen can tell "nothing new" with a plain `===` and skips re-drawing those days.
 */
export function mergeEntries(local: Entries, remote: Entries, keep: ReadonlySet<string>): Entries {
  let out: Entries | null = null;
  for (const d of Object.keys(remote)) {
    if (keep.has(d) && local[d]) continue; // the only up-to-date copy is on this screen
    if (local[d] && same(local[d], remote[d])) continue; // nothing new for that day
    (out ??= { ...local })[d] = remote[d];
  }
  return out ?? local;
}
