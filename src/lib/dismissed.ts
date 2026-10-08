// Which days' "fill in yesterday" lines you've waved away, which weeks' "last week" check-ins (written "w" + that
// week's Monday) and which evenings' "still open today" lines ("e" + that day), so a day, a week and an evening can never
// be mistaken for one another. Kept in a small cookie rather than in
// localStorage so the server can leave the line out in the first place: a line that's drawn and then
// removed once the page wakes up would push everything below it up the screen.

export const DISMISS_COOKIE = "qc";
const KEEP = 14;
const TOKEN_RE = /^[we]?\d{4}-\d{2}-\d{2}$/;

export function parseDismissed(raw: string | undefined | null): string[] {
  return (raw ?? "")
    .split("_")
    .filter((d) => TOKEN_RE.test(d))
    .slice(-KEEP);
}

export function serializeDismissed(dates: string[]): string {
  return dates.slice(-KEEP).join("_");
}
