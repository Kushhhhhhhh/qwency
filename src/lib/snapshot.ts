import { sanitizeSpec, normalizeData, DEFAULT_SPEC, type Data, type HabitSpec } from "./spec";
import { addDays, localKey, type Entries, type Mood } from "./tracker";
import { sanitizePlan, type MonthPlan } from "./goals";
import type { getDb } from "./db";

// Everything the app shows, read in one go. Shared by the first page load and by the quiet
// refresh that runs when the app comes back to the foreground, so both always agree.

export type Snapshot = { entries: Entries; focuses: Record<string, string>; plans: Record<string, MonthPlan>; spec: HabitSpec };

const WINDOW_DAYS = 190;

export async function readSnapshot(db: ReturnType<typeof getDb>, userId: string): Promise<Snapshot> {
  const since = addDays(localKey(new Date()), -WINDOW_DAYS);
  const [days, focus, specRow] = await Promise.all([
    db.from("day_entries").select("entry_date, mood, tags, note, data").eq("user_id", userId).gte("entry_date", since),
    // everything, so a database that hasn't added the `plan` column yet still loads (plans just read as empty)
    db.from("month_focus").select("*").eq("user_id", userId),
    db.from("habit_specs").select("spec").eq("user_id", userId).maybeSingle(),
  ]);
  const err = days.error ?? focus.error ?? specRow.error;
  if (err) {
    throw new Error(`Supabase: ${err.message} [${err.code}] ${err.hint ?? ""} ${err.details ?? ""}`);
  }

  // Sanitized on read, always: guards against a row written by an older/different version of
  // the app. A brand-new user gets the same sanitized default, written once, so what's saved
  // and what's on screen never disagree (otherwise option ids would change on the next load).
  let spec: HabitSpec;
  if (specRow.data) {
    spec = sanitizeSpec(specRow.data.spec);
  } else {
    spec = sanitizeSpec(DEFAULT_SPEC);
    await db.from("habit_specs").upsert({ user_id: userId, spec }, { onConflict: "user_id", ignoreDuplicates: true });
  }

  const entries: Entries = {};
  for (const r of days.data ?? []) {
    entries[r.entry_date] = {
      mood: (r.mood as Mood | null) ?? null,
      tags: r.tags ?? [],
      note: r.note ?? "",
      // answers recorded under an older id for the same option are read as today's id
      data: normalizeData(spec, (r.data as Data) ?? {}),
    };
  }
  const focuses: Record<string, string> = {};
  const plans: Record<string, MonthPlan> = {};
  for (const r of focus.data ?? []) {
    focuses[r.month] = r.focus;
    plans[r.month] = sanitizePlan(r.plan);
  }

  return { entries, focuses, plans, spec };
}
