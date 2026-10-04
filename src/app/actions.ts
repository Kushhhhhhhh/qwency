"use server";

import { auth } from "@clerk/nextjs/server";
import { getDb } from "@/lib/db";
import { applyPatch, recordHistory, sanitizeData, sanitizeSpec, type Data, type HabitSpec } from "@/lib/spec";
import { readSnapshot, WINDOW_DAYS, type Snapshot } from "@/lib/snapshot";
import { sanitizePlan, type MonthPlan } from "@/lib/goals";
import { fetchPage } from "@/lib/linkpreview";
import { parsePreview } from "@/lib/linkparse";
import { cleanUrl, hostOf, itemFromRow, itemToRow, MAX_ITEMS, MONTH_RE, sanitizeBudget, sanitizeItem, TITLE_MAX, type Item, type ItemRow } from "@/lib/shop";
import {
  addMonths,
  DATE_RE,
  FOCUS_MAX,
  MOODS,
  NOTE_MAX,
  WHY_TAGS,
  type Mood,
} from "@/lib/tracker";

type Result = { ok: boolean };

async function requireUser() {
  const { userId } = await auth();
  if (!userId) throw new Error("Unauthorized");
  return userId;
}

// The client decides "today" in its own timezone, so allow a day of slack either way.
function validDate(key: string) {
  if (!DATE_RE.test(key)) return false;
  const t = Date.parse(`${key}T00:00:00Z`);
  if (Number.isNaN(t)) return false;
  const days = (t - Date.now()) / 86_400_000;
  return days <= 1.5 && days >= -400;
}

async function run(fn: (userId: string) => PromiseLike<{ error: unknown }>): Promise<Result> {
  try {
    const userId = await requireUser();
    const { error } = await fn(userId);
    if (error) console.error(error);
    return { ok: !error };
  } catch (e) {
    console.error(e);
    return { ok: false };
  }
}

export async function setMood(date: string, mood: Mood | null): Promise<Result> {
  if (!validDate(date)) return { ok: false };
  if (mood !== null && !MOODS.some((m) => m.id === mood)) return { ok: false };
  return run(async (userId) =>
    (await getDb())
      .from("day_entries")
      .upsert(
        {
          user_id: userId,
          entry_date: date,
          mood,
          updated_at: new Date().toISOString(),
          // reasons only belong to rough days
          ...(mood !== "bad" ? { tags: [] } : {}),
        },
        { onConflict: "user_id,entry_date" },
      ),
  );
}

/**
 * Saves what one tap changed, merged into whatever the server already holds for that day.
 * Never "replace the whole day": a tab that's out of date, or a second device, would silently
 * wipe answers the other one logged. Only the keys this tap touched are written.
 */
export async function patchData(date: string, set: Data, remove: string[]): Promise<Result> {
  if (!validDate(date)) return { ok: false };
  const drop = Array.isArray(remove) ? remove.filter((k): k is string => typeof k === "string" && k.length <= 64).slice(0, 120) : [];
  const add = sanitizeData(set);
  return run(async (userId) => {
    const db = getDb();
    const found = await db.from("day_entries").select("data").eq("user_id", userId).eq("entry_date", date).maybeSingle();
    if (found.error) return found;
    const merged = applyPatch((found.data?.data as Data | null) ?? {}, add, drop);
    return db
      .from("day_entries")
      .upsert(
        { user_id: userId, entry_date: date, data: merged, updated_at: new Date().toISOString() },
        { onConflict: "user_id,entry_date" },
      );
  });
}

/**
 * A fresh read, for an app that's been in the background. Null if it couldn't be read. `days` limits
 * how far back the days reach (the setup, focus lines and monthly plans always come back whole).
 */
export async function loadSnapshot(days?: number): Promise<Snapshot | null> {
  try {
    const userId = await requireUser();
    const reach = typeof days === "number" && Number.isFinite(days) ? Math.min(Math.max(Math.floor(days), 7), WINDOW_DAYS) : WINDOW_DAYS;
    return await readSnapshot(getDb(), userId, reach);
  } catch (e) {
    console.error(e);
    return null;
  }
}

export async function saveTags(date: string, tags: string[]): Promise<Result> {
  if (!validDate(date)) return { ok: false };
  const allowed = new Set<string>(WHY_TAGS.map((t) => t.id));
  const clean = [...new Set(tags)].filter((t) => allowed.has(t));
  return run(async (userId) =>
    (await getDb())
      .from("day_entries")
      .update({ tags: clean, updated_at: new Date().toISOString() })
      .eq("user_id", userId)
      .eq("entry_date", date),
  );
}

export async function saveNote(date: string, note: string): Promise<Result> {
  if (!validDate(date)) return { ok: false };
  return run(async (userId) =>
    (await getDb())
      .from("day_entries")
      .upsert(
        {
          user_id: userId,
          entry_date: date,
          note: String(note).slice(0, NOTE_MAX),
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id,entry_date" },
      ),
  );
}

/**
 * Replaces the user's habit spec (what a day tracks) with a validated version of `next`. If a
 * rule changed (a schedule, what counts as a slip, a goal or target), the rule they *had* is
 * kept as history, taken from the spec already saved and never from the client, so days already
 * lived keep the rules they were judged by. `today` is the user's own calendar day. Returns the
 * spec as saved, so the screen shows exactly what the server holds.
 */
export async function saveSpec(next: HabitSpec, today: string): Promise<Result & { spec?: HabitSpec }> {
  if (!validDate(today)) return { ok: false };
  const clean = sanitizeSpec(next);
  let saved: HabitSpec = clean;
  const result = await run(async (userId) => {
    const db = getDb();
    const before = await db.from("habit_specs").select("spec").eq("user_id", userId).maybeSingle();
    if (before.error) return before;
    saved = before.data ? recordHistory(sanitizeSpec(before.data.spec), clean, today) : recordHistory({ sections: [] }, clean, today);
    return db
      .from("habit_specs")
      .upsert({ user_id: userId, spec: saved, updated_at: new Date().toISOString() }, { onConflict: "user_id" });
  });
  return result.ok ? { ok: true, spec: saved } : result;
}

/** A month's goals and review. Validated here; only that column is written, so the focus line is untouched. */
export async function savePlan(month: string, plan: MonthPlan): Promise<Result> {
  if (!/^\d{4}-\d{2}$/.test(month)) return { ok: false };
  const clean = sanitizePlan(plan);
  return run(async (userId) =>
    (await getDb()).from("month_focus").upsert({ user_id: userId, month, plan: clean }, { onConflict: "user_id,month" }),
  );
}

export async function saveFocus(month: string, focus: string): Promise<Result> {
  if (!/^\d{4}-\d{2}$/.test(month)) return { ok: false };
  return run(async (userId) =>
    (await getDb())
      .from("month_focus")
      .upsert(
        { user_id: userId, month, focus: String(focus).slice(0, FOCUS_MAX) },
        { onConflict: "user_id,month" },
      ),
  );
}

// ---------------------------------------------------------------- Shop

export type ShopLoad = { ok: true; items: Item[]; budgets: Record<string, number> } | { ok: false; setup: boolean };

// Postgres / PostgREST codes for "that table or column isn't there": the shop SQL hasn't been run yet
const NOT_SET_UP = new Set(["42P01", "PGRST205", "42703", "PGRST204"]);

/**
 * What the Shop page shows for a month: that month's things, everything on the Window shelf, anything
 * still planned from an earlier month (for the carry-over question), and the pocket for this month and
 * the one before (so it can offer "use it again"). `setup: true` means the SQL hasn't been run yet.
 */
export async function loadShop(month: string): Promise<ShopLoad> {
  if (!MONTH_RE.test(month)) return { ok: false, setup: false };
  try {
    const userId = await requireUser();
    const db = getDb();
    const before = addMonths(month, -1);
    const [items, budgets] = await Promise.all([
      db
        .from("shop_items")
        .select("*")
        .eq("user_id", userId)
        .or(`shelf.eq.window,month.eq.${month},and(shelf.eq.month,month.lt.${month})`)
        .order("sort", { ascending: true })
        .limit(MAX_ITEMS),
      db.from("month_focus").select("month, budget").eq("user_id", userId).in("month", [month, before]),
    ]);
    const err = items.error ?? budgets.error;
    if (err) {
      console.error(err);
      return { ok: false, setup: NOT_SET_UP.has(err.code) };
    }
    const out: Record<string, number> = {};
    for (const r of budgets.data ?? []) {
      const b = r.budget === null || r.budget === undefined ? null : sanitizeBudget(Number(r.budget));
      if (b !== null) out[r.month] = b;
    }
    return {
      ok: true,
      items: ((items.data ?? []) as ItemRow[]).map(itemFromRow).filter((i): i is Item => i !== null),
      budgets: out,
    };
  } catch (e) {
    console.error(e);
    return { ok: false, setup: false };
  }
}

/** Add or change one thing (its whole latest state). Checked here exactly as the screen checks it. */
export async function saveItem(item: Item): Promise<Result> {
  const clean = sanitizeItem(item);
  if (!clean) return { ok: false };
  return run(async (userId) => (await getDb()).from("shop_items").upsert(itemToRow(clean, userId), { onConflict: "user_id,id" }));
}

export async function removeItem(id: string): Promise<Result> {
  if (typeof id !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) return { ok: false };
  return run(async (userId) => (await getDb()).from("shop_items").delete().eq("user_id", userId).eq("id", id.toLowerCase()));
}

/** A month's pocket. null clears it. Only that column is written, so the focus line and goals are untouched. */
export async function saveBudget(month: string, amount: number | null): Promise<Result> {
  if (!MONTH_RE.test(month)) return { ok: false };
  const clean = amount === null ? null : sanitizeBudget(amount);
  if (amount !== null && clean === null) return { ok: false };
  return run(async (userId) => (await getDb()).from("month_focus").upsert({ user_id: userId, month, budget: clean }, { onConflict: "user_id,month" }));
}

// ---------------------------------------------------------------- reading a pasted link

export type LinkPreview = { ok: true; title: string; price: number | null; site: string } | { ok: false };

// A mild brake per person (per server instance): enough for adding a handful of things at once, not enough
// to use this as a free page fetcher.
const recent = new Map<string, number[]>();
const PREVIEWS_PER_MINUTE = 12;

/**
 * The title and price a shop's own page gives for a link you pasted. One page, on your request, never
 * stored, never repeated. Anything that goes wrong (a shop that blocks us, a timeout, a link we won't
 * visit) is just { ok: false }: you type it instead.
 */
export async function previewLink(url: string): Promise<LinkPreview> {
  try {
    const userId = await requireUser();
    const link = cleanUrl(url);
    if (!link) return { ok: false };
    const now = Date.now();
    const mine = (recent.get(userId) ?? []).filter((t) => now - t < 60_000);
    if (mine.length >= PREVIEWS_PER_MINUTE) return { ok: false };
    recent.set(userId, [...mine, now]);
    const page = await fetchPage(link);
    const p = parsePreview(page.html, hostOf(page.finalUrl));
    const title = p.title.slice(0, TITLE_MAX).trim();
    if (!title && p.price === null) return { ok: false };
    return { ok: true, title, price: p.price, site: p.site };
  } catch {
    return { ok: false };
  }
}

