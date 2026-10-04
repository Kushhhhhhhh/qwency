import type { HabitSpec } from "./spec";
import { listTitles } from "./insights";
import { DATE_RE } from "./tracker";

// Shop: a monthly pocket (budget) and the things you actually need. Think of the pocket as a suitcase of
// a fixed size: needs are packed first, wants fill what's left, and a line shows where it's full.
// Everything here is plain data and plain arithmetic (no React, no network) so it can be tested alone.

export type Kind = "need" | "want";
/** month = planned this month, window = saved to look at later, bought = a receipt, skipped = decided against */
export type Shelf = "month" | "window" | "bought" | "skipped";

export type Item = {
  /** made on the phone (a uuid), so something added offline already has its permanent name */
  id: string;
  /** the month it belongs to (YYYY-MM). A Window item isn't tied to a month. */
  month: string;
  title: string;
  /** what you expect to pay; null = not priced yet */
  price: number | null;
  url: string;
  note: string;
  icon: string;
  kind: Kind;
  shelf: Shelf;
  /** what you actually paid, for the Bought shelf */
  boughtPrice: number | null;
  boughtOn: string | null;
  /** the order you put things in (lower = earlier) */
  sort: number;
};

export const TITLE_MAX = 80;
export const ITEM_NOTE_MAX = 200;
export const URL_MAX = 500;
export const PRICE_MAX = 10_000_000;
export const BUDGET_MAX = 100_000_000;
export const MAX_ITEMS = 500;

const KINDS: Kind[] = ["need", "want"];
const SHELVES: Shelf[] = ["month", "window", "bought", "skipped"];
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
export const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

const round2 = (n: number) => Math.round(n * 100) / 100;

// ---------------------------------------------------------------- icons (instead of pictures)

/** The picks, in picker order. The drawing for each lives in shop-icons.ts (kept apart so this file stays plain code). */
export const SHOP_ICON_IDS = [
  "bag", "cart", "shirt", "shoes", "phone", "headphones",
  "laptop", "tv", "watch", "glasses", "gift", "home",
  "lamp", "sofa", "food", "book", "fitness", "beauty",
  "baby", "games", "travel", "tools", "bike", "health",
] as const;
export type ShopIconId = (typeof SHOP_ICON_IDS)[number];

const isIcon = (x: unknown): x is ShopIconId => typeof x === "string" && (SHOP_ICON_IDS as readonly string[]).includes(x);

// ---------------------------------------------------------------- links

// Parameters that only say "this click came from an ad / an email / a share" and never change the page.
const TRACKING = /^(utm_[a-z_]+|srsltid|gclid|gbraid|wbraid|fbclid|igshid|msclkid|mc_cid|mc_eid|_ga|_gl|yclid|dclid)$/i;

/** A usable link, or "". Adds https:// to "myntra.com/x", refuses anything that isn't http(s), drops any login and ad-tracking parameters in it. */
export function cleanUrl(input: unknown): string {
  if (typeof input !== "string") return "";
  let s = input.trim();
  if (!s || s.length > URL_MAX || /\s/.test(s)) return "";
  if (!/^[a-z][a-z0-9+.-]*:/i.test(s)) {
    if (!/^[^/.\s]+\.[^/\s]{2,}/.test(s)) return ""; // "myntra.com/x", not just a word
    s = `https://${s}`;
  }
  try {
    const u = new URL(s);
    if (u.protocol !== "https:" && u.protocol !== "http:") return "";
    if (!u.hostname.includes(".")) return "";
    u.username = "";
    u.password = "";
    for (const k of [...u.searchParams.keys()]) if (TRACKING.test(k)) u.searchParams.delete(k);
    const out = u.toString();
    return out.length <= URL_MAX ? out : "";
  } catch {
    return "";
  }
}

// Path pieces that are never a product's name: the words shops put around an id.
const NOT_A_NAME = new Set(["p", "dp", "gp", "pd", "pdp", "product", "products", "item", "items", "buy", "shop", "store", "catalog", "catalogue", "detail", "details", "view", "en", "in", "us", "uk", "ae", "global", "www", "amp"]);

const UNITS = new Set(["gb", "tb", "mb", "mah", "tv", "led", "usb", "ssd", "hdd", "rgb", "hdmi", "gps", "pc", "hd", "uhd", "ram", "rom", "ac", "uv", "dc", "oled", "lcd", "cpu", "gpu"]);
const SMALL = new Set(["a", "an", "and", "or", "of", "in", "on", "at", "to", "for", "the", "with", "by"]);

/**
 * A product's name from the link's own words, with no network at all: shops put it in the address
 * ("…/nutripro-juicer-mixer-grinder-smoothie-maker/p/hxfwhp" -> "Nutripro Juicer Mixer Grinder Smoothie Maker").
 * Works for shops that refuse to be read. Returns "" when the address has no name in it.
 */
export function titleFromUrl(url: string): string {
  let path: string;
  try {
    path = new URL(url).pathname;
  } catch {
    return "";
  }
  let best: string[] = [];
  for (const raw of path.split("/")) {
    let seg: string;
    try {
      seg = decodeURIComponent(raw);
    } catch {
      seg = raw;
    }
    seg = seg.replace(/\.(html?|php|aspx?|jsp)$/i, "");
    if (!seg || NOT_A_NAME.has(seg.toLowerCase()) || !/[a-z]/i.test(seg)) continue;
    if (!/[-_+]/.test(seg)) continue; // one word is an id or a category, not a name
    let words = seg.split(/[-_+]+/).filter(Boolean);
    // "men-s" is "men's"
    words = words.reduce<string[]>((acc, w) => (/^s$/i.test(w) && acc.length ? [...acc.slice(0, -1), `${acc[acc.length - 1]}'s`] : [...acc, w]), []);
    // a number glued on the end is the shop's id, not part of the name ("…-white-80275887")
    while (words.length > 1 && /^\d{6,}$/.test(words[words.length - 1])) words.pop();
    // an id-looking piece (letters and digits mixed, long) isn't a word either
    words = words.filter((w) => !(w.length >= 9 && /\d/.test(w) && /[a-z]/i.test(w)));
    // a name has at least two real words in it ("abc-123" is a code)
    if (words.filter((w) => /[a-z]/i.test(w)).length >= 2 && words.length >= best.length) best = words;
  }
  if (best.length === 0) return "";
  const cased = best.map((w, i) => {
    if (UNITS.has(w.toLowerCase())) return w.toUpperCase(); // 128 gb -> 128 GB
    if (/[A-Z]/.test(w)) return w; // iPhone, GB, boAt: keep the shop's own capitals
    if (i > 0 && SMALL.has(w)) return w; // "of", "and" stay small in the middle
    return w[0].toUpperCase() + w.slice(1);
  });
  let title = cased.join(" ");
  if (title.length > TITLE_MAX) title = title.slice(0, TITLE_MAX).replace(/\s+\S*$/, "");
  return title;
}

/** "myntra.com" for display (no www, no path). */
export function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

/** The first link in a piece of text (what a shop app puts in "Share": "Check this out https://... "). */
export function extractUrl(text: string): string {
  const m = text.match(/https?:\/\/[^\s<>"')]+/i);
  return m ? cleanUrl(m[0].replace(/[.,;:!?]+$/, "")) : "";
}

/** "Running shoes https://shop.com/p/1" -> the link and what's left of the words. A bare address counts as the link. */
export function splitLink(text: string): { url: string; rest: string } {
  const t = text.trim();
  const whole = cleanUrl(t);
  if (whole) return { url: whole, rest: "" };
  const m = t.match(/https?:\/\/[^\s<>"')]+/i);
  if (!m) return { url: "", rest: t };
  const url = cleanUrl(m[0].replace(/[.,;:!?]+$/, ""));
  return url ? { url, rest: t.replace(m[0], "").replace(/\s+/g, " ").trim() } : { url: "", rest: t };
}

/**
 * What a phone's Share sheet hands over (a title, some text, a link, in whichever of those a shop's app chose)
 * as a link and a tidy title. Shop apps write things like "Check out this Apple iPhone 15 on Flipkart: https://...",
 * so the sales words around the product's name are trimmed.
 */
export function shareDraft(input: { title?: string; text?: string; url?: string }): { title: string; url: string } {
  const title = (input.title ?? "").trim();
  const text = (input.text ?? "").trim();
  const url = cleanUrl(input.url) || extractUrl(text) || extractUrl(title);
  const noLinks = (t: string) => t.replace(/https?:\/\/\S+/gi, " ").replace(/\s+/g, " ").trim();
  const from = noLinks(title) || noLinks(text);
  const words = from
    .replace(/[\s:;\-–—,]+$/, "")
    .replace(/\s+(?:on|at|from|via)\s+[A-Za-z0-9.]+$/i, "")
    .replace(/^(?:hey[,!]?\s*)?(?:check\s*out|look at|have a look at|take a look at|see)\s+(?:this|these|the|my)?\s*/i, "")
    .replace(/[\s:;\-–—,]+$/, "")
    .trim()
    .slice(0, TITLE_MAX);
  return { title: words, url };
}

// ---------------------------------------------------------------- one item, checked

const collapse = (s: string) => s.replace(/\s+/g, " ").trim();

export function sanitizeItem(input: unknown): Item | null {
  if (!input || typeof input !== "object") return null;
  const r = input as Record<string, unknown>;
  const id = typeof r.id === "string" ? r.id.toLowerCase() : "";
  if (!UUID_RE.test(id)) return null;
  const month = typeof r.month === "string" && MONTH_RE.test(r.month) ? r.month : null;
  if (!month) return null;

  const url = cleanUrl(r.url);
  let title = typeof r.title === "string" ? collapse(r.title).slice(0, TITLE_MAX) : "";
  if (!title && url) title = (titleFromUrl(url) || hostOf(url)).slice(0, TITLE_MAX);
  if (!title) return null;

  const num = (v: unknown, max: number): number | null =>
    typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= max ? round2(v) : null;
  const shelf: Shelf = SHELVES.includes(r.shelf as Shelf) ? (r.shelf as Shelf) : "month";
  const sort = typeof r.sort === "number" && Number.isFinite(r.sort) ? Math.min(1_000_000, Math.max(0, Math.round(r.sort))) : 0;

  return {
    id,
    month,
    title,
    price: num(r.price, PRICE_MAX),
    url,
    note: typeof r.note === "string" ? collapse(r.note).slice(0, ITEM_NOTE_MAX) : "",
    icon: isIcon(r.icon) ? r.icon : "bag",
    kind: KINDS.includes(r.kind as Kind) ? (r.kind as Kind) : "need",
    shelf,
    boughtPrice: shelf === "bought" ? num(r.boughtPrice, PRICE_MAX) : null,
    boughtOn: shelf === "bought" && typeof r.boughtOn === "string" && DATE_RE.test(r.boughtOn) ? r.boughtOn : null,
    sort,
  };
}

/** A budget, or null for "not set". */
export function sanitizeBudget(input: unknown): number | null {
  return typeof input === "number" && Number.isFinite(input) && input >= 0 && input <= BUDGET_MAX ? round2(input) : null;
}

export function newItemId(): string {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (c?.randomUUID) return c.randomUUID().toLowerCase();
  // very old browsers: good enough for a name only this person's rows are ever compared on
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (ch) => {
    const n = (Math.random() * 16) | 0;
    return (ch === "x" ? n : (n & 0x3) | 0x8).toString(16);
  });
}

// ---------------------------------------------------------------- the database's shape

export type ItemRow = {
  id: string;
  month: string;
  title: string;
  price: number | string | null;
  url: string;
  note: string;
  icon: string;
  kind: string;
  shelf: string;
  bought_price: number | string | null;
  bought_on: string | null;
  sort: number;
};

/** numeric columns can come back as strings; read either */
const asNum = (v: unknown) => (v === null || v === undefined ? null : Number(v));

export function itemFromRow(r: ItemRow): Item | null {
  return sanitizeItem({
    id: r.id,
    month: r.month,
    title: r.title,
    price: asNum(r.price),
    url: r.url,
    note: r.note,
    icon: r.icon,
    kind: r.kind,
    shelf: r.shelf,
    boughtPrice: asNum(r.bought_price),
    boughtOn: r.bought_on,
    sort: r.sort,
  });
}

export function itemToRow(i: Item, userId: string) {
  return {
    user_id: userId,
    id: i.id,
    month: i.month,
    title: i.title,
    price: i.price,
    url: i.url,
    note: i.note,
    icon: i.icon,
    kind: i.kind,
    shelf: i.shelf,
    bought_price: i.boughtPrice,
    bought_on: i.boughtOn,
    sort: i.sort,
    updated_at: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------- money

/** The symbol in front of amounts: the one from your own Spending question, so Shop reads like the rest of the app. */
export function currencyOf(spec: HabitSpec): string {
  const amounts = spec.sections.flatMap((s) => s.fields).filter((f) => f.kind === "amount");
  const spend = amounts.find((f) => f.key === "spend") ?? amounts[0];
  return spend && spend.kind === "amount" && spend.prefix ? spend.prefix : "₹";
}

export const moneyFor = (prefix: string) => (n: number) => `${prefix}${round2(n).toLocaleString()}`;

// ---------------------------------------------------------------- the pocket

const byPacking = (a: Item, b: Item) => (a.kind === b.kind ? 0 : a.kind === "need" ? -1 : 1) || a.sort - b.sort || (a.id < b.id ? -1 : 1);

/** A long product name shortened for the middle of a sentence ("Wireless headphones with active noi…"). */
export const brief = (title: string, max = 28): string => (title.length > max ? `${title.slice(0, max - 2).trimEnd()}…` : title);

/** What's planned this month, in the order it gets packed: needs first, then wants, each in your own order. */
export const packingOrder = (items: Item[], month: string): Item[] => items.filter((i) => i.shelf === "month" && i.month === month).sort(byPacking);

export type Pocket = {
  budget: number | null;
  /** already spent this month (the Bought shelf) */
  bought: number;
  /** everything planned this month, priced */
  planned: number;
  /** budget - bought - planned; below zero = over the pocket */
  left: number | null;
  /** planned things in packing order */
  order: Item[];
  /** how many of `order` fit above the line (all of them when there's no budget) */
  fits: number;
  /** planned things with no price yet (they count as nothing until they have one) */
  unpriced: number;
  /** how far the needs alone are over what's free (0 when they fit) */
  needsOver: number;
  sentence: string;
};

export function pocketView(budget: number | null, items: Item[], month: string, money: (n: number) => string): Pocket {
  const order = packingOrder(items, month);
  const bought = round2(
    items.filter((i) => i.shelf === "bought" && i.month === month).reduce((a, i) => a + (i.boughtPrice ?? i.price ?? 0), 0),
  );
  const price = (i: Item) => i.price ?? 0;
  const planned = round2(order.reduce((a, i) => a + price(i), 0));
  const unpriced = order.filter((i) => i.price === null).length;

  if (budget === null) {
    return { budget, bought, planned, left: null, order, fits: order.length, unpriced, needsOver: 0, sentence: "Set your pocket to see what fits this month." };
  }

  const free = round2(budget - bought);
  let run = 0;
  let fits = 0;
  for (const i of order) {
    if (run + price(i) > free + 1e-9) break;
    run = round2(run + price(i));
    fits++;
  }
  const needsTotal = round2(order.filter((i) => i.kind === "need").reduce((a, i) => a + price(i), 0));
  const needsOver = Math.max(0, round2(needsTotal - free));
  const left = round2(free - planned);

  let sentence: string;
  if (free < 0) {
    sentence = `You've already spent ${money(-free)} more than your pocket.`;
  } else if (order.length === 0) {
    sentence = bought > 0 ? `${money(bought)} spent, ${money(free)} still free. Nothing planned yet.` : `Your pocket is ${money(budget)}. Nothing planned yet.`;
  } else if (left > 0) {
    sentence = bought > 0 ? `${money(bought)} spent, ${money(left)} still free after what's planned.` : `${money(left)} is still free after what's planned.`;
  } else if (left === 0) {
    sentence = "Your pocket is exactly full.";
  } else if (needsOver > 0) {
    sentence = `Your needs alone are ${money(needsOver)} over your pocket.`;
  } else {
    const waiting = order.slice(fits).map((i) => brief(i.title));
    sentence = `The list is ${money(-left)} over your pocket. ${listTitles(waiting)} won't fit this month.`;
  }
  return { budget, bought, planned, left, order, fits, unpriced, needsOver, sentence };
}

// ---------------------------------------------------------------- moving things around

/** The next place at the end of a shelf. */
export const nextSort = (items: Item[]) => items.reduce((m, i) => Math.max(m, i.sort), -1) + 1;

/**
 * Move an item one place earlier or later among the items it's packed with (same shelf, month and kind).
 * Returns only the items whose place changed (normally two), or [] when it's already at that end.
 * Items that happen to share a place are given distinct ones as part of the move.
 */
export function nudge(items: Item[], id: string, dir: -1 | 1): Item[] {
  const me = items.find((i) => i.id === id);
  if (!me) return [];
  const mates = items
    .filter((i) => i.shelf === me.shelf && i.month === me.month && i.kind === me.kind)
    .sort((a, b) => a.sort - b.sort || (a.id < b.id ? -1 : 1));
  const at = mates.findIndex((i) => i.id === id);
  const to = at + dir;
  if (at < 0 || to < 0 || to >= mates.length) return [];
  const arr = [...mates];
  [arr[at], arr[to]] = [arr[to], arr[at]];
  let prev = -1;
  const changed: Item[] = [];
  arr.forEach((it, i) => {
    const place = Math.max(mates[i].sort, prev + 1);
    prev = place;
    if (it.sort !== place) changed.push({ ...it, sort: place });
  });
  return changed;
}

/** Things still planned from an earlier month: the carry-over question on the 1st. */
export const carryOver = (items: Item[], month: string): Item[] => items.filter((i) => i.shelf === "month" && i.month < month).sort(byPacking);

/** The Window shelf, newest first. */
export const windowShelf = (items: Item[]): Item[] => items.filter((i) => i.shelf === "window").sort((a, b) => b.sort - a.sort || (a.id < b.id ? -1 : 1));

/** The receipts for a month (newest first), and what was decided against. */
export const receipts = (items: Item[], month: string): Item[] =>
  items.filter((i) => i.shelf === "bought" && i.month === month).sort((a, b) => (b.boughtOn ?? "").localeCompare(a.boughtOn ?? "") || b.sort - a.sort);
export const skipped = (items: Item[], month: string): Item[] => items.filter((i) => i.shelf === "skipped" && i.month === month).sort((a, b) => b.sort - a.sort);
