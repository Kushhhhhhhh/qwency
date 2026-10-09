"use client";

import { useState, type ReactNode } from "react";
import { Check, ChevronDown, Frown, Meh, Smile } from "lucide-react";
import { iconFor } from "@/lib/icons";
import { MOODS, NOTE_MAX, type Entry, type Mood } from "@/lib/tracker";
import type { AwayReason } from "@/lib/spec";
import { AwayLink } from "./away";
import { Fold } from "./fold";
import { NoteBox, NoteButton } from "./note-field";
import { WhySelector } from "./why-selector";

export const TILE_VARIANTS = ["lilac", "meh", "good"] as const;
export type TileVariant = (typeof TILE_VARIANTS)[number];

/**
 * One section of the day. While there is still something to answer it is a coloured card with its questions. A section
 * that was already finished when the day opened (see lib/today) is drawn as one quiet line ("Sleep · 6–7h") that opens
 * when tapped; one you finish just now stays open under your finger, with a chevron to tuck it away. So colour means
 * "still to do", and the page is shorter every time you come back to it.
 */
export function SectionCard({
  icon,
  title,
  hint,
  done,
  complete,
  summary,
  missed,
  muted,
  index,
  variant,
  note,
  children,
}: {
  icon: string;
  title: string;
  hint: string;
  /** something is answered (the tick) */
  done: boolean;
  /** nothing is waiting for an answer: it may fold up */
  complete: boolean;
  /** the answers in a few words, for the folded line */
  summary: string;
  /** an answer landed on the wrong side of its line (the folded line says so) */
  missed: boolean;
  /** not planned today: still tappable, just quieter */
  muted?: boolean;
  index: number;
  variant: TileVariant;
  /** this section's note: its saved text, and how to save a new one */
  note: { value: string; max: number; onSave: (v: string) => Promise<boolean>; placeholder: string };
  children: ReactNode;
}) {
  const Icon = iconFor(icon);
  // A card is folded only if it was already finished when the day was opened, or you tucked it away yourself. One you
  // are answering never closes on its own, however fast you tap (a second answer, a muscle, a note can still follow).
  const [foldedAtStart] = useState(complete);
  const [byHand, setByHand] = useState<boolean | null>(null); // true: you opened it, false: you tucked it away
  const [noteOpen, setNoteOpen] = useState(Boolean(note.value));

  const folded = complete && (byHand === null ? foldedAtStart : !byHand);
  const canFold = complete;

  const head = (
    <>
      <span className={`flex shrink-0 items-center justify-center rounded-2xl ${folded ? "size-9 bg-lilac/50" : "size-10 bg-surface/55"}`}>
        <Icon size={folded ? 18 : 20} strokeWidth={1.8} />
      </span>
      <div className="min-w-0 flex-1">
        <h2 className="text-base font-semibold leading-tight">{title}</h2>
        {folded ? (
          <p className="flex items-center gap-1.5 text-sm text-ink/85">
            {missed && <i aria-hidden className="size-2 shrink-0 rounded-full bg-bad" />}
            <span className="truncate">{summary}</span>
            {missed && <span className="sr-only">(missed)</span>}
          </p>
        ) : (
          <p className="text-xs text-soft">{hint}</p>
        )}
      </div>
    </>
  );

  return (
    <section className={`${folded ? "card px-4 py-3" : `tile tile-${variant} p-5`} rise`} style={{ animationDelay: `${index * 45}ms` }}>
      {/* dimmed on an inner wrapper: the entrance animation fills forward with opacity 1 and
          would override an opacity class on the section itself */}
      <div className={`transition-opacity ${muted ? "opacity-80" : ""}`}>
        <header className="flex items-center gap-3">
          {canFold ? (
            <button type="button" aria-expanded={!folded} onClick={() => setByHand(folded)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
              {head}
              <ChevronDown size={16} aria-hidden className={`shrink-0 text-soft transition-transform duration-200 ${folded ? "" : "rotate-180"}`} />
            </button>
          ) : (
            <div className="flex min-w-0 flex-1 items-center gap-3">{head}</div>
          )}
          {!folded && <NoteButton open={noteOpen} filled={Boolean(note.value)} label={`Note about ${title.toLowerCase()}`} onClick={() => setNoteOpen((o) => !o)} />}
          <span
            className={`flex size-7 shrink-0 items-center justify-center rounded-full border transition-colors duration-300 ${
              done ? "border-transparent bg-ink" : "border-ink/20 bg-surface/30"
            }`}
          >
            {done && <Check key="c" size={15} strokeWidth={3} className="check-pop text-cream" />}
          </span>
        </header>
        <Fold open={!folded}>
          <div className="-mt-1">
            {children}
            <NoteBox open={noteOpen} value={note.value} max={note.max} onSave={note.onSave} placeholder={note.placeholder} />
          </div>
        </Fold>
      </div>
    </section>
  );
}

const MOOD_ICON = { good: Smile, meh: Meh, bad: Frown };
const MOOD_ICON_COLOR: Record<Mood, string> = { good: "text-good", meh: "text-meh", bad: "text-bad" };

/**
 * The day overall, as one slim card at the top of Today: three faces, the lightest possible way to log a day. A Rough
 * day opens the reasons right under the faces. The day's note and "mark it away" live in the same card.
 */
export function DayVerdict({
  entry,
  away,
  isToday,
  index = 0,
  onMood,
  onTags,
  onNote,
  onAway,
}: {
  entry: Entry;
  /** why this day is away, if it is (the verdict isn't judged then, so it doesn't ask what got in the way) */
  away: AwayReason | null;
  isToday: boolean;
  index?: number;
  onMood: (m: Mood) => void;
  onTags: (tags: string[]) => void;
  onNote: (note: string) => Promise<boolean>;
  onAway: (reason: AwayReason | null) => void;
}) {
  const [noteOpen, setNoteOpen] = useState(Boolean(entry.note));
  return (
    <section className="card rise px-4 py-3.5" aria-label="The day overall" style={{ animationDelay: `${index * 45}ms` }}>
      <div className="flex items-center gap-2">
        <h2 className="min-w-0 flex-1 text-base font-semibold leading-tight">{isToday ? "How's today going?" : "How was this day?"}</h2>
        <NoteButton open={noteOpen} filled={Boolean(entry.note)} label="Note about the day" onClick={() => setNoteOpen((o) => !o)} />
      </div>

      <div className="mt-2.5 grid grid-cols-3 gap-2">
        {MOODS.map((m) => {
          const on = entry.mood === m.id;
          const Icon = MOOD_ICON[m.id];
          return (
            <button
              key={m.id}
              type="button"
              data-on={on}
              aria-pressed={on}
              title={m.sub}
              onClick={() => onMood(m.id)}
              className={`chip flex min-h-12 items-center justify-center gap-2 rounded-2xl px-2 ${on ? "bg-ink text-cream shadow-md shadow-shade/30" : ""}`}
            >
              <Icon size={22} strokeWidth={1.8} className={`shrink-0 ${on ? MOOD_ICON_COLOR[m.id] : ""}`} />
              <span className="text-sm font-semibold">{m.label}</span>
            </button>
          );
        })}
      </div>

      <WhySelector tags={entry.tags} open={entry.mood === "bad" && !away} onChange={onTags} />

      <NoteBox
        open={noteOpen}
        value={entry.note}
        max={NOTE_MAX}
        onSave={onNote}
        placeholder="Anything worth remembering about today. Wins, vents, thoughts."
      />

      {!away && <AwayLink onPick={onAway} />}
    </section>
  );
}
