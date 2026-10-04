import { emptyBox, parseBox, type Box } from "./outbox";

// Where the outbox is kept between visits: this browser's localStorage, one entry per signed-in
// person, so someone else signing in on the same phone never sees or sends your waiting changes.
// If storage isn't available (a private window, blocked site data) these return null / false and the
// app keeps the outbox in memory instead, which is no worse than before.

const key = (userId: string) => `qwency:outbox:v1:${userId}`;

/** What is waiting for this person, or null when this browser can't store anything. */
export function readBox(userId: string, now = Date.now()): Box | null {
  try {
    const raw = localStorage.getItem(key(userId));
    return raw ? parseBox(JSON.parse(raw), now) : emptyBox();
  } catch {
    return null;
  }
}

/** Save it, or clear the entry when nothing is waiting. False when storage refused. */
export function writeBox(userId: string, box: Box, empty: boolean): boolean {
  try {
    if (empty) localStorage.removeItem(key(userId));
    else localStorage.setItem(key(userId), JSON.stringify(box));
    return true;
  } catch {
    return false;
  }
}
