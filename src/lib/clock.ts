// Which calendar day (and hour) it is for a person, worked out from their time zone, so the server
// can send the real Today screen instead of a "Loading…" the browser has to replace. The browser
// stays the authority: it remembers its zone in a cookie, and corrects the page if the guess was off.

export const TZ_COOKIE = "tz";

const ZONE_RE = /^[A-Za-z][A-Za-z0-9_+-]*(?:\/[A-Za-z0-9_+-]+){0,2}$/;

/** A time zone name the runtime understands (never trusts a cookie or header blindly). */
export function validZone(zone: string | null | undefined): zone is string {
  if (!zone || zone.length > 64 || !ZONE_RE.test(zone)) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: zone });
    return true;
  } catch {
    return false;
  }
}

/** The first usable zone: the one the browser told us, then the one Vercel guessed from the IP, then the server's own. */
export function pickZone(...candidates: (string | null | undefined)[]): string {
  for (const c of candidates) {
    const z = c ? safeDecode(c) : "";
    if (validZone(z)) return z;
  }
  return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
}

function safeDecode(s: string) {
  try {
    return decodeURIComponent(s);
  } catch {
    return "";
  }
}

/** YYYY-MM-DD for `now` in `zone`. */
export function todayIn(zone: string, now: Date = new Date()): string {
  const p = new Intl.DateTimeFormat("en-US", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  const get = (t: string) => p.find((x) => x.type === t)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

/** 0-23 for `now` in `zone`. */
export function hourIn(zone: string, now: Date = new Date()): number {
  const p = new Intl.DateTimeFormat("en-US", { timeZone: zone, hour: "numeric", hourCycle: "h23" }).formatToParts(now);
  const h = Number(p.find((x) => x.type === "hour")?.value ?? "12");
  return Number.isFinite(h) ? h % 24 : 12;
}
