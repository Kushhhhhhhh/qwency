"use client";

import { useLayoutEffect, useRef } from "react";
import { dayDone, dayTotal, hasActivity, specAt, type HabitSpec } from "@/lib/spec";
import { addDays, weekdayIndex, WEEKDAYS, type Entries } from "@/lib/tracker";

const DAYS = 21;

export function DayStrip({
  entries,
  today,
  selected,
  spec,
  onSelect,
}: {
  entries: Entries;
  today: string;
  selected: string;
  spec: HabitSpec;
  onSelect: (d: string) => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  // also when the day rolls over, so the new "Today" isn't left off-screen to the right.
  // Before paint, so the strip never shows its first frame scrolled to the wrong end.
  useLayoutEffect(() => {
    box.current?.scrollTo({ left: box.current.scrollWidth });
  }, [today]);

  const days = Array.from({ length: DAYS }, (_, i) => addDays(today, i - (DAYS - 1)));

  return (
    <div ref={box} className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 py-1">
      {days.map((d) => {
        const on = d === selected;
        const active = hasActivity(entries[d], spec);
        // each day against the plan it had, so a later change never rewrites it
        const then = specAt(spec, d);
        const complete = active && dayDone(entries[d], d, then) >= dayTotal(then, d);
        return (
          <button
            key={d}
            type="button"
            onClick={() => onSelect(d)}
            aria-label={d}
            aria-current={on ? "date" : undefined}
            className={`flex w-12 shrink-0 flex-col items-center gap-1 rounded-2xl border py-2 transition-[background-color,border-color,box-shadow,transform] duration-200 active:scale-95 ${
              on
                ? "border-transparent bg-ink text-cream shadow-lg shadow-shade/25"
                : "border-ink/10 bg-surface/60 hover:border-ink/30"
            }`}
          >
            <span className={`text-[11px] font-medium uppercase ${on ? "text-cream/70" : "text-soft"}`}>
              {d === today ? "Today" : WEEKDAYS[weekdayIndex(d)]}
            </span>
            <span className="text-base font-semibold tabular-nums">{Number(d.slice(8))}</span>
            <span
              className={`size-1.5 rounded-full transition-colors ${
                complete ? "bg-good" : active ? (on ? "bg-cream/70" : "bg-ink/40") : "bg-transparent"
              }`}
            />
          </button>
        );
      })}
    </div>
  );
}
