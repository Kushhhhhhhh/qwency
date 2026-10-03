import { DATE_RE } from "./tracker";

// Which days' "fill in yesterday" lines you've waved away. Kept in a small cookie rather than in
// localStorage so the server can leave the line out in the first place: a line that's drawn and then
// removed once the page wakes up would push everything below it up the screen.

export const DISMISS_COOKIE = "qc";
const KEEP = 14;

export function parseDismissed(raw: string | undefined | null): string[] {
  return (raw ?? "")
    .split("_")
    .filter((d) => DATE_RE.test(d))
    .slice(-KEEP);
}

export function serializeDismissed(dates: string[]): string {
  return dates.slice(-KEEP).join("_");
}
