import type { Fact, Facts } from "./facts";

// What "Worth noticing" shows, given what the person has closed. Closing is remembered in this browser (not in
// your days): a fact you closed stays closed (matched by its id, so it stays closed as its counts move), and the
// waiting / "nothing stands out" message can be closed too, which only hides *that message*. Once there are
// enough days and something does stand out, facts show again; a different fact is never hidden by closing another.

export const HIDDEN_KEY = "qwency:hidden-facts";
/** the token for the "starts after about 3 weeks" / "nothing clearly stands out" message */
export const WAITING = "waiting";

const KEEP = 40;

export function parseHidden(raw: string | null | undefined): string[] {
  try {
    const v: unknown = JSON.parse(raw || "[]");
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && x.length > 0 && x.length <= 120).slice(-KEEP) : [];
  } catch {
    return [];
  }
}

export const hide = (list: string[], id: string): string[] => [...list.filter((x) => x !== id), id].slice(-KEEP);

export type NoticingView =
  | { kind: "none" }
  | { kind: "waiting"; need: number }
  | { kind: "quiet"; judged: number }
  | { kind: "facts"; facts: Fact[]; judged: number };

/** What the card draws. `facts` was found with the closed ones already skipped (see findFacts' `skip`). */
export function noticingView(found: Facts, hidden: readonly string[]): NoticingView {
  if (found.judged === 0) return { kind: "none" }; // nothing logged yet: the mirror above already says so
  const closed = hidden.includes(WAITING);
  if (found.need > 0) return closed ? { kind: "none" } : { kind: "waiting", need: found.need };
  const facts = found.facts.filter((f) => !hidden.includes(f.id));
  if (facts.length > 0) return { kind: "facts", facts, judged: found.judged };
  return closed || hidden.length > 0 ? { kind: "none" } : { kind: "quiet", judged: found.judged };
}
