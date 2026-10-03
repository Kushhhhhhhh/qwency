"use server";

import { auth } from "@clerk/nextjs/server";
import { getDb } from "@/lib/db";
import { applyPatch, recordHistory, sanitizeData, sanitizeSpec, type Data, type HabitSpec } from "@/lib/spec";
import { readSnapshot, WINDOW_DAYS, type Snapshot } from "@/lib/snapshot";
import { sanitizePlan, type MonthPlan } from "@/lib/goals";
import {
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
