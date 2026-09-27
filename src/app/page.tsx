import { auth } from "@clerk/nextjs/server";
import { getDb } from "@/lib/db";
import { Tracker } from "@/components/tracker";
import { localKey, addDays, type Entries, type Mood } from "@/lib/tracker";
import { DEFAULT_SPEC, sanitizeSpec, type Data, type HabitSpec } from "@/lib/spec";

export default async function Home() {
  const { userId } = await auth();
  if (!userId) return null; // proxy.ts already redirects signed-out visitors

  const since = addDays(localKey(new Date()), -190);
  const db = getDb();
  // Seed new users with the default spec, once, without ever clobbering a spec they've since
  // edited: insert-if-missing, then always read back whatever ends up in the row.
  await db.from("habit_specs").upsert(
    { user_id: userId, spec: DEFAULT_SPEC },
    { onConflict: "user_id", ignoreDuplicates: true },
  );
  const [days, focus, specRow] = await Promise.all([
    db
      .from("day_entries")
      .select("entry_date, mood, tags, note, data")
      .eq("user_id", userId)
      .gte("entry_date", since),
    db.from("month_focus").select("month, focus").eq("user_id", userId),
    db.from("habit_specs").select("spec").eq("user_id", userId).maybeSingle(),
  ]);
  const err = days.error ?? focus.error ?? specRow.error;
  if (err) {
    throw new Error(`Supabase: ${err.message} [${err.code}] ${err.hint ?? ""} ${err.details ?? ""}`);
  }
  // sanitized again on read: guards against a row written by an older/different version of the app
  const spec: HabitSpec = specRow.data ? sanitizeSpec(specRow.data.spec) : DEFAULT_SPEC;

  const entries: Entries = {};
  for (const r of days.data ?? []) {
    entries[r.entry_date] = {
      mood: (r.mood as Mood | null) ?? null,
      tags: r.tags ?? [],
      note: r.note ?? "",
      data: (r.data as Data) ?? {},
    };
  }
  const focuses: Record<string, string> = {};
  for (const r of focus.data ?? []) focuses[r.month] = r.focus;

  return <Tracker initialEntries={entries} initialFocus={focuses} initialSpec={spec} />;
}
