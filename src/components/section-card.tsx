"use client";

import { type ReactNode } from "react";
import { Check, Frown, Meh, Smile } from "lucide-react";
import { iconFor } from "@/lib/icons";
import { MOODS, NOTE_MAX, type Entry, type Mood } from "@/lib/tracker";
import { NoteField } from "./note-field";
import { WhySelector } from "./why-selector";

export const TILE_VARIANTS = ["lilac", "meh", "good"] as const;
export type TileVariant = (typeof TILE_VARIANTS)[number];

export function SectionCard({
  icon,
  title,
  hint,
  done,
  muted,
  index,
  variant,
  children,
}: {
  icon: string;
  title: string;
  hint: string;
  done: boolean;
  /** not planned today: still tappable, just quieter */
  muted?: boolean;
  index: number;
  variant: TileVariant;
  children: ReactNode;
}) {
  const Icon = iconFor(icon);
  return (
    <section className={`tile tile-${variant} rise p-5`} style={{ animationDelay: `${index * 45}ms` }}>
      {/* dimmed on an inner wrapper: the entrance animation fills forward with opacity 1 and
          would override an opacity class on the section itself */}
      <div className={`transition-opacity ${muted ? "opacity-70" : ""}`}>
        <header className="flex items-center gap-3">
          <span className="flex size-10 items-center justify-center rounded-2xl bg-white/55">
            <Icon size={20} strokeWidth={1.8} />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-semibold leading-tight">{title}</h2>
            <p className="text-xs text-ink/70">{hint}</p>
          </div>
          <span
            className={`flex size-7 items-center justify-center rounded-full border transition-colors duration-300 ${
              done ? "border-transparent bg-ink" : "border-ink/20 bg-white/30"
            }`}
          >
            {done && <Check key="c" size={15} strokeWidth={3} className="check-pop text-cream" />}
          </span>
        </header>
        <div className="-mt-1">{children}</div>
      </div>
    </section>
  );
}

const MOOD_ICON = { good: Smile, meh: Meh, bad: Frown };
const MOOD_ICON_COLOR: Record<Mood, string> = { good: "text-good", meh: "text-meh", bad: "text-bad" };

/** Overall verdict + the WHY flow (only shows on rough days) + the day-level note. */
export function DayVerdict({
  entry,
  onMood,
  onTags,
  onNote,
}: {
  entry: Entry;
  onMood: (m: Mood) => void;
  onTags: (tags: string[]) => void;
  onNote: (note: string) => Promise<boolean>;
}) {
  return (
    <div className="pt-4">
      <div className="grid grid-cols-3 gap-3">
        {MOODS.map((m) => {
          const on = entry.mood === m.id;
          const Icon = MOOD_ICON[m.id];
          return (
            <button
              key={m.id}
              type="button"
              data-on={on}
              aria-pressed={on}
              onClick={() => onMood(m.id)}
              className={`chip flex flex-col items-center gap-1 rounded-2xl py-4 ${
                on ? "bg-ink text-cream shadow-md shadow-ink/30" : ""
              }`}
            >
              <Icon size={26} strokeWidth={1.8} className={on ? MOOD_ICON_COLOR[m.id] : ""} />
              <span className="text-sm font-semibold">{m.label}</span>
              <span className="text-[11px] opacity-60">{m.sub}</span>
            </button>
          );
        })}
      </div>

      <WhySelector tags={entry.tags} open={entry.mood === "bad"} onChange={onTags} />

      <NoteField
        value={entry.note}
        max={NOTE_MAX}
        onSave={onNote}
        placeholder="Anything worth remembering about today. Wins, vents, thoughts."
        openLabel="Add a note"
        filledLabel="Note for this day"
      />
    </div>
  );
}
