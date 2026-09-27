"use client";

import { useMemo, useState } from "react";
import { Frown, Meh, Search, Smile } from "lucide-react";
import { MOODS, WHY_TAGS, prettyDate, type Entries, type Mood } from "@/lib/tracker";

// Every note anyone's ever written, in one scrollable place. Not a separate journaling
// module — just a way to read back what's already being collected as the day-verdict note.

const MOOD_ICON = { good: Smile, meh: Meh, bad: Frown };
const MOOD_TEXT: Record<Mood, string> = { good: "text-good", meh: "text-meh", bad: "text-bad" };
const WHY_LABEL = new Map<string, string>(WHY_TAGS.map((t) => [t.id, t.label]));

export function Journal({ entries, onPick }: { entries: Entries; onPick: (date: string) => void }) {
  const [query, setQuery] = useState("");
  const [mood, setMood] = useState<Mood | "all">("all");

  const all = useMemo(
    () =>
      Object.entries(entries)
        .filter(([, e]) => e.note.trim().length > 0)
        .sort((a, b) => (a[0] < b[0] ? 1 : -1)), // newest first — date keys sort lexically
    [entries],
  );

  const shown = all.filter(([, e]) => {
    if (mood !== "all" && e.mood !== mood) return false;
    if (query.trim() && !e.note.toLowerCase().includes(query.trim().toLowerCase())) return false;
    return true;
  });

  return (
    <div className="flex flex-col gap-4">
      <section className="tile tile-lilac p-5">
        <p className="text-xs font-medium uppercase tracking-wider text-ink/70">Journal</p>
        <h2 className="mt-1 text-base font-semibold">Everything you've written</h2>
        <p className="mt-1 text-sm text-ink/75">
          {all.length === 0
            ? "Notes you add on any day show up here — a running record, not a separate thing to keep up with."
            : `${all.length} note${all.length === 1 ? "" : "s"} so far.`}
        </p>

        {all.length > 0 && (
          <>
            <div className="mt-4 flex items-center gap-2 rounded-full border border-ink/15 bg-white/70 px-3 py-2">
              <Search size={15} className="shrink-0 text-ink/50" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search your notes"
                className="w-full bg-transparent text-sm outline-none placeholder:text-ink/45"
              />
            </div>

            <div className="mt-3 flex flex-wrap gap-1.5">
              {(["all", ...MOODS.map((m) => m.id)] as const).map((id) => {
                const on = mood === id;
                const label = id === "all" ? "All" : MOODS.find((m) => m.id === id)!.label;
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setMood(id)}
                    aria-pressed={on}
                    className={`chip rounded-full px-3 py-1.5 text-xs font-medium ${on ? "bg-ink text-cream" : "text-ink"}`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </>
        )}
      </section>

      {all.length > 0 && shown.length === 0 && (
        <p className="px-1 text-sm text-ink/60">Nothing matches "{query}".</p>
      )}

      <div className="flex flex-col gap-3">
        {shown.map(([date, e]) => {
          const Icon = e.mood ? MOOD_ICON[e.mood] : null;
          return (
            <button
              key={date}
              type="button"
              onClick={() => onPick(date)}
              className="card rise p-4 text-left transition-transform active:scale-[0.99]"
            >
              <div className="flex items-center gap-2 text-xs text-ink/60">
                {Icon && <Icon size={15} strokeWidth={2} className={MOOD_TEXT[e.mood!]} />}
                <span className="font-medium">{prettyDate(date)}</span>
              </div>
              <p className="mt-1.5 whitespace-pre-wrap text-sm leading-snug text-ink/90">{e.note}</p>
              {e.mood === "bad" && e.tags.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {e.tags.map((t) => (
                    <span key={t} className="rounded-full bg-bad/15 px-2 py-0.5 text-[11px] font-medium text-ink/70">
                      {WHY_LABEL.get(t) ?? t}
                    </span>
                  ))}
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
