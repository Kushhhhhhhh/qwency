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

export const sameEntry = (a: Entry | undefined, b: Entry | undefined) => canon(a ?? EMPTY_ENTRY) === canon(b ?? EMPTY_ENTRY);

/**
 * Fold a fresh read from the server into what's on screen. The server wins, except for days in
 * `keep`: days whose last save failed, where this screen holds the only copy of what you logged.
 */
export function mergeEntries(local: Entries, remote: Entries, keep: ReadonlySet<string>): Entries {
  const out: Entries = { ...local, ...remote };
  for (const d of keep) if (local[d]) out[d] = local[d];
  return out;
}
