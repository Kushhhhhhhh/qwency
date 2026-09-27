"use server";

import { auth } from "@clerk/nextjs/server";
import { getDb } from "@/lib/db";
import { sanitizeData, sanitizeSpec, type Data, type HabitSpec } from "@/lib/spec";
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

/** Replaces the day's tracked answers (whatever the user's own spec asks for) as a whole. */
export async function saveData(date: string, data: Data): Promise<Result> {
  if (!validDate(date)) return { ok: false };
  return run(async (userId) =>
    (await getDb())
      .from("day_entries")
      .upsert(
        {
          user_id: userId,
          entry_date: date,
          data: sanitizeData(data),
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id,entry_date" },
      ),
  );
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

/** Replaces the user's whole habit spec (what a day tracks) with a validated version of `next`. */
export async function saveSpec(next: HabitSpec): Promise<Result> {
  const clean = sanitizeSpec(next);
  return run(async (userId) =>
    (await getDb())
      .from("habit_specs")
      .upsert({ user_id: userId, spec: clean, updated_at: new Date().toISOString() }, { onConflict: "user_id" }),
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
