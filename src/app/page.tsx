import { auth } from "@clerk/nextjs/server";
import { getDb } from "@/lib/db";
import { Tracker } from "@/components/tracker";
import { localKey, addDays, type Entries, type Mood } from "@/lib/tracker";
import type { Data } from "@/lib/habits";

export default async function Home() {
  const { userId } = await auth();
  if (!userId) return null; // proxy.ts already redirects signed-out visitors

  const since = addDays(localKey(new Date()), -190);
  const db = getDb();
  const [days, focus] = await Promise.all([
    db
      .from("day_entries")
      .select("entry_date, mood, tags, note, data")
      .eq("user_id", userId)
      .gte("entry_date", since),
    db.from("month_focus").select("month, focus").eq("user_id", userId),
  ]);
  const err = days.error ?? focus.error;
  if (err) {
    throw new Error(`Supabase: ${err.message} [${err.code}] ${err.hint ?? ""} ${err.details ?? ""}`);
  }

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

  return <Tracker initialEntries={entries} initialFocus={focuses} />;
}
