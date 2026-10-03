"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { catchUp, listTitles, openToday } from "@/lib/insights";
import type { HabitSpec } from "@/lib/spec";
import { prettyDate, type Entries } from "@/lib/tracker";

// Two quiet lines at the top of Today, never a popup and never a count of how you're doing:
//  - yesterday had planned things you never logged: one tap goes to that day to fill them in
//  - it's evening and today still has open sections
// Both only look at what the mirror already knows. Dismissing the first is remembered for that day.

const KEY = "qwency:catchup-dismissed";
const EVENING = 20; // 8pm

export function Nudges({
  spec,
  entries,
  today,
  selected,
  hour,
  onFill,
}: {
  spec: HabitSpec;
  entries: Entries;
  today: string;
  selected: string;
  hour: number;
  onFill: (date: string) => void;
}) {
  // remembered per day in this browser; if storage isn't available it just reappears, which is harmless
  const [dismissed, setDismissed] = useState<string[]>([]);
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(KEY) ?? "[]");
      if (Array.isArray(saved)) setDismissed(saved.filter((x): x is string => typeof x === "string").slice(-14));
    } catch {
      /* private window or blocked storage */
    }
  }, []);

  if (selected !== today) return null;

  const missed = catchUp(spec, entries, today);
  const open = openToday(spec, entries, today);
  const showCatchUp = missed !== null && !dismissed.includes(missed.date);
  const showEvening = hour >= EVENING && open.length > 0;
  if (!showCatchUp && !showEvening) return null;

  function dismiss(date: string) {
    const next = [...dismissed, date].slice(-14);
    setDismissed(next);
    try {
      localStorage.setItem(KEY, JSON.stringify(next));
    } catch {
      /* ignore */
    }
  }

  return (
    <div className="flex flex-col gap-2">
      {showCatchUp && missed && (
        <div role="status" className="flex items-start gap-3 rounded-2xl border border-ink/10 bg-white/70 px-4 py-3 text-sm">
          <p className="min-w-0 flex-1 leading-snug text-ink/85">
            <span className="font-semibold text-ink">{prettyDate(missed.date).split(",")[0]}</span> has {missed.titles.length} not logged:{" "}
            {listTitles(missed.titles)}.{" "}
            <button type="button" onClick={() => onFill(missed.date)} className="font-semibold text-ink underline underline-offset-2">
              Fill in
            </button>
          </p>
          <button
            type="button"
            onClick={() => dismiss(missed.date)}
            aria-label="Not now"
            className="-mr-1 flex size-6 shrink-0 items-center justify-center rounded-full text-ink/50 transition-colors hover:text-ink"
          >
            <X size={14} />
          </button>
        </div>
      )}
      {showEvening && (
        <p role="status" className="rounded-2xl bg-white/50 px-4 py-2.5 text-sm leading-snug text-ink/80">
          {open.length === 1 ? "1 thing" : `${open.length} things`} still open today: {listTitles(open)}.
        </p>
      )}
    </div>
  );
}
