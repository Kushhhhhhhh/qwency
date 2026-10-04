"use client";

import { useDeferredValue, useMemo, useState } from "react";
import { Frown, Meh, Search, Smile } from "lucide-react";
import { MOODS, WHY_TAGS, prettyDate, type Entries, type Entry, type Mood } from "@/lib/tracker";
import { sectionNoteKey, type HabitSpec } from "@/lib/spec";
import { iconFor } from "@/lib/icons";

// Every note anyone's ever written, in one scrollable place. Not a separate journaling
// module — a way to read back what you're already collecting. Two sources feed this: the
// day-level "Note for this day" *and* every per-section note. A single day can appear as
// multiple entries here if you wrote in more than one place; that's on purpose (each note
// is its own moment, tied to its section's context).

const MOOD_ICON = { good: Smile, meh: Meh, bad: Frown };
const MOOD_TEXT: Record<Mood, string> = { good: "text-good", meh: "text-meh", bad: "text-bad" };
const WHY_LABEL = new Map<string, string>(WHY_TAGS.map((t) => [t.id, t.label]));

// Long histories are shown a page at a time: a year of notes is hundreds of cards, and drawing them
// all at once is what makes the tab slow to open and to search.
const PAGE = 30;

type Item = {
  date: string;
  entry: Entry;
  source: { kind: "day" } | { kind: "section"; id: string; title: string; icon: string };
  text: string;
};

export function Journal({
  entries,
  spec,
  onPick,
}: {
  entries: Entries;
  spec: HabitSpec;
  onPick: (date: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [mood, setMood] = useState<Mood | "all">("all");
  const [limit, setLimit] = useState(PAGE);
  // typing stays instant; the list catches up a moment later
  const search = useDeferredValue(query);

  const all = useMemo<Item[]>(() => {
    const out: Item[] = [];
    for (const [date, entry] of Object.entries(entries)) {
      if (entry.note.trim().length > 0) {
        out.push({ date, entry, source: { kind: "day" }, text: entry.note });
      }
      for (const s of spec.sections) {
        const t = entry.data[sectionNoteKey(s.id)];
        if (typeof t === "string" && t.trim().length > 0) {
          out.push({ date, entry, source: { kind: "section", id: s.id, title: s.title, icon: s.icon }, text: t });
        }
      }
    }
    return out.sort((a, b) => (a.date < b.date ? 1 : -1)); // newest first
  }, [entries, spec]);

  const needle = search.trim().toLowerCase();
  const matching = all.filter((it) => {
    if (mood !== "all" && it.entry.mood !== mood) return false;
    if (needle && !it.text.toLowerCase().includes(needle)) return false;
    return true;
  });
  const shown = matching.slice(0, limit);

  return (
    <div className="flex flex-col gap-4">
      <section className="tile tile-lilac p-5">
        <p className="text-xs font-medium uppercase tracking-wider text-soft">Journal</p>
        <h2 className="mt-1 text-base font-semibold">Everything you've written</h2>
        <p className="mt-1 text-sm text-soft">
          {all.length === 0
            ? "Anything you jot down — on a section or at the end of a day — shows up here."
            : `${all.length} note${all.length === 1 ? "" : "s"} so far.`}
        </p>

        {all.length > 0 && (
          <>
            <div className="mt-4 flex items-center gap-2 rounded-full border border-ink/15 bg-surface/70 px-3 py-2">
              <Search size={15} className="shrink-0 text-soft" />
              <input
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setLimit(PAGE);
                }}
                placeholder="Search your notes"
                className="w-full bg-transparent text-sm outline-none placeholder:text-soft"
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
                    onClick={() => {
                      setMood(id);
                      setLimit(PAGE);
                    }}
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

      {all.length > 0 && matching.length === 0 && (
        <p className="px-1 text-sm text-soft">Nothing matches "{query}".</p>
      )}

      <div className="flex flex-col gap-3">
        {shown.map((it) => {
          const MoodIcon = it.entry.mood ? MOOD_ICON[it.entry.mood] : null;
          const SectionIcon = it.source.kind === "section" ? iconFor(it.source.icon) : null;
          return (
            <button
              key={`${it.date}|${it.source.kind === "section" ? it.source.id : "day"}`}
              type="button"
              onClick={() => onPick(it.date)}
              // off-screen cards aren't laid out or painted until they scroll near
              className="card rise p-4 text-left transition-transform [contain-intrinsic-size:auto_6rem] [content-visibility:auto] active:scale-[0.99]"
            >
              <div className="flex flex-wrap items-center gap-2 text-xs text-soft">
                {MoodIcon && <MoodIcon size={15} strokeWidth={2} className={MOOD_TEXT[it.entry.mood!]} />}
                <span className="font-medium">{prettyDate(it.date)}</span>
                {it.source.kind === "section" && SectionIcon && (
                  <span className="flex items-center gap-1 rounded-full bg-lilac/40 px-2 py-0.5 text-xs font-medium text-ink">
                    <SectionIcon size={11} strokeWidth={2} />
                    {it.source.title}
                  </span>
                )}
              </div>
              <p className="mt-1.5 whitespace-pre-wrap text-sm leading-snug text-ink/90">{it.text}</p>
              {it.source.kind === "day" && it.entry.mood === "bad" && it.entry.tags.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {it.entry.tags.map((t) => (
                    <span key={t} className="rounded-full bg-bad/15 px-2 py-0.5 text-xs font-medium text-ink">
                      {WHY_LABEL.get(t) ?? t}
                    </span>
                  ))}
                </div>
              )}
            </button>
          );
        })}
      </div>

      {matching.length > shown.length && (
        <button
          type="button"
          onClick={() => setLimit((n) => n + PAGE)}
          className="chip self-center rounded-full px-5 py-2 text-sm font-medium"
        >
          Show more ({matching.length - shown.length} older)
        </button>
      )}
    </div>
  );
}
