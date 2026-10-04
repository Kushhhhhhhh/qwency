import { applyPatch, sanitizeData, type Data } from "./spec";
import { sanitizePlan, type MonthPlan } from "./goals";
import { MONTH_RE, sanitizeBudget, sanitizeItem, type Item } from "./shop";
import { same } from "./sync";
import { DATE_RE, EMPTY_ENTRY, FOCUS_MAX, MOODS, NOTE_MAX, WHY_TAGS, type Entries, type Mood } from "./tracker";

// The outbox: what you changed that the server hasn't confirmed yet. Every save is written here before
// it is sent and crossed off when the server says yes, so a dropped connection, a lift, a closed tab or
// a killed app can't lose it: the next time the app opens it shows these changes on screen and sends them.
// Only your *unsent changes* are kept (never a copy of your days), and only on this device.
//
// Everything here is pure (no storage, no network) so the rules can be tested on their own.

export type DayBox = {
  /** answers changed since the last confirmed save, and answers cleared */
  set?: Data;
  remove?: string[];
  /** present (even as null) means "the verdict was changed" */
  mood?: Mood | null;
  tags?: string[];
  note?: string;
  /** when this day first had something waiting, so a change that can never be saved isn't retried forever */
  at: number;
};
export type Waiting<T> = { v: T; at: number };
export type Box = {
  v: 1;
  days: Record<string, DayBox>;
  focus: Record<string, Waiting<string>>;
  plans: Record<string, Waiting<MonthPlan>>;
  /** Shop: an item added or changed (its whole latest state), or null for "removed" */
  items: Record<string, Waiting<Item | null>>;
  /** Shop: a month's pocket; null clears it */
  budgets: Record<string, Waiting<number | null>>;
};

/** One change, as it is queued, sent and crossed off. */
export type Op =
  | { kind: "data"; date: string; set: Data; remove: string[] }
  | { kind: "mood"; date: string; mood: Mood | null }
  | { kind: "tags"; date: string; tags: string[] }
  | { kind: "note"; date: string; note: string }
  | { kind: "focus"; month: string; text: string }
  | { kind: "plan"; month: string; plan: MonthPlan }
  | { kind: "item"; item: Item }
  | { kind: "itemRemove"; id: string }
  | { kind: "budget"; month: string; amount: number | null };

export const MAX_AGE_MS = 14 * 86_400_000; // older than this and it's given up on (see DayBox.at)
const MAX_DAYS = 60;
const MAX_ITEMS = 200;

export const emptyBox = (): Box => ({ v: 1, days: {}, focus: {}, plans: {}, items: {}, budgets: {} });

export function isEmpty(b: Box): boolean {
  return (
    Object.keys(b.days).length === 0 &&
    Object.keys(b.focus).length === 0 &&
    Object.keys(b.plans).length === 0 &&
    Object.keys(b.items).length === 0 &&
    Object.keys(b.budgets).length === 0
  );
}

/** Everything that has something waiting, as the keys the screen uses for "don't overwrite this with the server's copy". */
export function waitingKeys(b: Box): Set<string> {
  return new Set([...Object.keys(b.days), ...Object.keys(b.focus).map((m) => `focus:${m}`), ...Object.keys(b.plans).map((m) => `plan:${m}`)]);
}

// ---------------------------------------------------------------- queueing

/** Add a change. A later change to the same thing replaces the earlier one; answers merge answer by answer. */
export function queue(b: Box, op: Op, now: number): Box {
  switch (op.kind) {
    case "data": {
      const d = b.days[op.date] ?? { at: now };
      const set: Data = { ...d.set, ...op.set };
      for (const k of op.remove) delete set[k];
      const remove = [...new Set([...(d.remove ?? []).filter((k) => !(k in op.set)), ...op.remove])];
      return withDay(b, op.date, { ...d, set, remove });
    }
    case "mood":
      // reasons only belong to rough days: the server clears them when the verdict isn't Rough, so this does too
      return withDay(b, op.date, { ...(b.days[op.date] ?? { at: now }), mood: op.mood, ...(op.mood !== "bad" ? { tags: [] } : {}) });
    case "tags":
      return withDay(b, op.date, { ...(b.days[op.date] ?? { at: now }), tags: op.tags });
    case "note":
      return withDay(b, op.date, { ...(b.days[op.date] ?? { at: now }), note: op.note });
    case "focus":
      return { ...b, focus: { ...b.focus, [op.month]: { v: op.text, at: b.focus[op.month]?.at ?? now } } };
    case "plan":
      return { ...b, plans: { ...b.plans, [op.month]: { v: op.plan, at: b.plans[op.month]?.at ?? now } } };
    case "item":
      return { ...b, items: { ...b.items, [op.item.id]: { v: op.item, at: b.items[op.item.id]?.at ?? now } } };
    case "itemRemove":
      return { ...b, items: { ...b.items, [op.id]: { v: null, at: b.items[op.id]?.at ?? now } } };
    case "budget":
      return { ...b, budgets: { ...b.budgets, [op.month]: { v: op.amount, at: b.budgets[op.month]?.at ?? now } } };
  }
}

function withDay(b: Box, date: string, day: DayBox): Box {
  return { ...b, days: { ...b.days, [date]: day } };
}

// ---------------------------------------------------------------- crossing off

/**
 * The server confirmed `op`: cross it off, but only the part that is still exactly what was sent. If you
 * changed the same thing again while it was on its way, that newer change stays waiting.
 */
export function settle(b: Box, op: Op): Box {
  switch (op.kind) {
    case "data": {
      const d = b.days[op.date];
      if (!d) return b;
      const set: Data = { ...d.set };
      for (const k of Object.keys(op.set)) if (k in set && same(set[k], op.set[k])) delete set[k];
      const remove = (d.remove ?? []).filter((k) => !op.remove.includes(k));
      return putDay(b, op.date, { ...d, set: nonEmpty(set), remove: remove.length ? remove : undefined });
    }
    case "mood": {
      const d = b.days[op.date];
      if (!d || !("mood" in d) || d.mood !== op.mood) return b;
      const { mood: _gone, ...rest } = d;
      // the server cleared the reasons itself when it saved a verdict that isn't Rough
      if (op.mood !== "bad" && rest.tags && rest.tags.length === 0) delete rest.tags;
      return putDay(b, op.date, rest);
    }
    case "tags": {
      const d = b.days[op.date];
      if (!d || !d.tags || !same(d.tags, op.tags)) return b;
      const { tags: _gone, ...rest } = d;
      return putDay(b, op.date, rest);
    }
    case "note": {
      const d = b.days[op.date];
      if (!d || d.note === undefined || d.note !== op.note) return b;
      const { note: _gone, ...rest } = d;
      return putDay(b, op.date, rest);
    }
    case "focus": {
      if (b.focus[op.month]?.v !== op.text) return b;
      const { [op.month]: _gone, ...focus } = b.focus;
      return { ...b, focus };
    }
    case "plan": {
      if (!b.plans[op.month] || !same(b.plans[op.month].v, op.plan)) return b;
      const { [op.month]: _gone, ...plans } = b.plans;
      return { ...b, plans };
    }
    case "item": {
      const w = b.items[op.item.id];
      if (!w || w.v === null || !same(w.v, op.item)) return b; // changed again meanwhile: the newer state stays waiting
      const { [op.item.id]: _gone, ...items } = b.items;
      return { ...b, items };
    }
    case "itemRemove": {
      const w = b.items[op.id];
      if (!w || w.v !== null) return b; // it was brought back meanwhile
      const { [op.id]: _gone, ...items } = b.items;
      return { ...b, items };
    }
    case "budget": {
      const w = b.budgets[op.month];
      if (!w || w.v !== op.amount) return b;
      const { [op.month]: _gone, ...budgets } = b.budgets;
      return { ...b, budgets };
    }
  }
}

const nonEmpty = (d: Data): Data | undefined => (Object.keys(d).length ? d : undefined);

/** Store a day, or drop it once nothing is waiting on it. */
function putDay(b: Box, date: string, day: DayBox): Box {
  const waiting = day.set || day.remove || "mood" in day || day.tags || day.note !== undefined;
  if (waiting) return withDay(b, date, day);
  const { [date]: _gone, ...days } = b.days;
  return { ...b, days };
}

// ---------------------------------------------------------------- what to send

/** The waiting changes as separate sends, in an order that works (a day's verdict before its reasons). */
export function pendingOps(b: Box): Op[] {
  const ops: Op[] = [];
  for (const date of Object.keys(b.days).sort()) {
    const d = b.days[date];
    if (d.set || d.remove) ops.push({ kind: "data", date, set: d.set ?? {}, remove: d.remove ?? [] });
    if ("mood" in d) ops.push({ kind: "mood", date, mood: d.mood ?? null });
    if (d.tags) ops.push({ kind: "tags", date, tags: d.tags });
    if (d.note !== undefined) ops.push({ kind: "note", date, note: d.note });
  }
  for (const month of Object.keys(b.focus).sort()) ops.push({ kind: "focus", month, text: b.focus[month].v });
  for (const month of Object.keys(b.plans).sort()) ops.push({ kind: "plan", month, plan: b.plans[month].v });
  for (const month of Object.keys(b.budgets).sort()) ops.push({ kind: "budget", month, amount: b.budgets[month].v });
  for (const id of Object.keys(b.items).sort((x, y) => b.items[x].at - b.items[y].at || (x < y ? -1 : 1))) {
    const v = b.items[id].v;
    ops.push(v === null ? { kind: "itemRemove", id } : { kind: "item", item: v });
  }
  return ops;
}

// ---------------------------------------------------------------- on screen

/** Your days with the waiting changes applied, so what you did is what you see. The same object comes back when nothing waits. */
export function overlayEntries(entries: Entries, b: Box): Entries {
  const dates = Object.keys(b.days);
  if (dates.length === 0) return entries;
  const out: Entries = { ...entries };
  for (const date of dates) {
    const d = b.days[date];
    const base = out[date] ?? EMPTY_ENTRY;
    out[date] = {
      mood: "mood" in d ? (d.mood ?? null) : base.mood,
      tags: d.tags ?? base.tags,
      note: d.note ?? base.note,
      data: d.set || d.remove ? applyPatch(base.data, d.set ?? {}, d.remove ?? []) : base.data,
    };
  }
  return out;
}

export function overlayFocus(focuses: Record<string, string>, b: Box): Record<string, string> {
  const months = Object.keys(b.focus);
  if (months.length === 0) return focuses;
  const out = { ...focuses };
  for (const m of months) out[m] = b.focus[m].v;
  return out;
}

export function overlayPlans(plans: Record<string, MonthPlan>, b: Box): Record<string, MonthPlan> {
  const months = Object.keys(b.plans);
  if (months.length === 0) return plans;
  const out = { ...plans };
  for (const m of months) out[m] = b.plans[m].v;
  return out;
}

/** The Shop list with the waiting changes applied. The same array comes back when nothing waits. */
export function overlayItems(items: Item[], b: Box): Item[] {
  const ids = Object.keys(b.items);
  if (ids.length === 0) return items;
  const waiting = b.items;
  const out = items.filter((i) => !(i.id in waiting) || waiting[i.id].v !== null).map((i) => (waiting[i.id]?.v ? (waiting[i.id].v as Item) : i));
  const have = new Set(out.map((i) => i.id));
  for (const id of ids) {
    const v = waiting[id].v;
    if (v !== null && !have.has(id)) out.push(v);
  }
  return out;
}

export function overlayBudgets(budgets: Record<string, number>, b: Box): Record<string, number> {
  const months = Object.keys(b.budgets);
  if (months.length === 0) return budgets;
  const out = { ...budgets };
  for (const m of months) {
    const v = b.budgets[m].v;
    if (v === null) delete out[m];
    else out[m] = v;
  }
  return out;
}

// ---------------------------------------------------------------- reading it back safely

const isObj = (x: unknown): x is Record<string, unknown> => !!x && typeof x === "object" && !Array.isArray(x);
const stamp = (x: unknown, now: number) => (typeof x === "number" && Number.isFinite(x) && x > 0 && x <= now ? x : now);

/** Whatever is in storage, made safe: unknown shapes are ignored, values are checked like the server checks them, old items are dropped. */
export function parseBox(raw: unknown, now: number): Box {
  const out = emptyBox();
  if (!isObj(raw) || raw.v !== 1) return out;

  if (isObj(raw.days)) {
    for (const date of Object.keys(raw.days).sort().slice(-MAX_DAYS)) {
      const r = raw.days[date];
      if (!DATE_RE.test(date) || !isObj(r)) continue;
      const at = stamp(r.at, now);
      if (now - at > MAX_AGE_MS) continue;
      const d: DayBox = { at };
      const set = sanitizeData(r.set);
      if (Object.keys(set).length) d.set = set;
      if (Array.isArray(r.remove)) {
        const remove = [...new Set(r.remove.filter((k): k is string => typeof k === "string" && k.length <= 64))].slice(0, 120);
        if (remove.length) d.remove = remove;
      }
      if ("mood" in r && (r.mood === null || MOODS.some((m) => m.id === r.mood))) d.mood = r.mood as Mood | null;
      if (Array.isArray(r.tags)) {
        const allowed = new Set<string>(WHY_TAGS.map((t) => t.id));
        d.tags = [...new Set(r.tags)].filter((t): t is string => typeof t === "string" && allowed.has(t));
      }
      if (typeof r.note === "string") d.note = r.note.slice(0, NOTE_MAX);
      if (d.set || d.remove || "mood" in d || d.tags || d.note !== undefined) out.days[date] = d;
    }
  }
  if (isObj(raw.focus)) {
    for (const month of Object.keys(raw.focus)) {
      const r = raw.focus[month];
      if (!MONTH_RE.test(month) || !isObj(r) || typeof r.v !== "string") continue;
      const at = stamp(r.at, now);
      if (now - at <= MAX_AGE_MS) out.focus[month] = { v: r.v.slice(0, FOCUS_MAX), at };
    }
  }
  if (isObj(raw.plans)) {
    for (const month of Object.keys(raw.plans)) {
      const r = raw.plans[month];
      if (!MONTH_RE.test(month) || !isObj(r)) continue;
      const at = stamp(r.at, now);
      if (now - at <= MAX_AGE_MS) out.plans[month] = { v: sanitizePlan(r.v), at };
    }
  }
  if (isObj(raw.items)) {
    for (const id of Object.keys(raw.items).slice(-MAX_ITEMS)) {
      const r = raw.items[id];
      if (!isObj(r)) continue;
      const at = stamp(r.at, now);
      if (now - at > MAX_AGE_MS) continue;
      if (r.v === null) {
        out.items[id.toLowerCase()] = { v: null, at };
        continue;
      }
      const item = sanitizeItem(r.v);
      if (item && item.id === id.toLowerCase()) out.items[item.id] = { v: item, at };
    }
  }
  if (isObj(raw.budgets)) {
    for (const month of Object.keys(raw.budgets)) {
      const r = raw.budgets[month];
      if (!MONTH_RE.test(month) || !isObj(r)) continue;
      const at = stamp(r.at, now);
      if (now - at > MAX_AGE_MS) continue;
      if (r.v === null) out.budgets[month] = { v: null, at };
      else {
        const amount = sanitizeBudget(r.v);
        if (amount !== null) out.budgets[month] = { v: amount, at };
      }
    }
  }
  return out;
}
