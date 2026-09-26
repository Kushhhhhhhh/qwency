"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Briefcase, Check, Droplets, Dumbbell, Frown, Meh, Minus, Moon, Plus, Smile, Sun, Wallet } from "lucide-react";
import type { SectionId } from "@/lib/habits";
import { MOODS, NOTE_MAX, WHY_TAGS, type Entry, type Mood } from "@/lib/tracker";
import { Chip } from "./ui";

const ICONS = { sleep: Moon, work: Briefcase, gym: Dumbbell, skin: Droplets, spend: Wallet, day: Sun };

export function SectionCard({
  id,
  title,
  hint,
  done,
  index,
  children,
}: {
  id: SectionId;
  title: string;
  hint: string;
  done: boolean;
  index: number;
  children: ReactNode;
}) {
  const Icon = ICONS[id];
  return (
    <section className="card rise p-5" style={{ animationDelay: `${index * 45}ms` }}>
      <header className="flex items-center gap-3">
        <span className="flex size-10 items-center justify-center rounded-2xl bg-lilac/60">
          <Icon size={20} strokeWidth={1.8} />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-semibold leading-tight">{title}</h2>
          <p className="text-xs text-ink/55">{hint}</p>
        </div>
        <span
          className={`flex size-7 items-center justify-center rounded-full border transition-colors duration-300 ${
            done ? "border-transparent bg-good" : "border-ink/15"
          }`}
        >
          {done && <Check key="c" size={15} strokeWidth={3} className="check-pop text-[#2b2946]" />}
        </span>
      </header>
      <div className="-mt-1">{children}</div>
    </section>
  );
}

const MOOD_ICON = { good: Smile, meh: Meh, bad: Frown };
const MOOD_ICON_COLOR: Record<Mood, string> = { good: "text-good", meh: "text-meh", bad: "text-bad" };

/** Overall verdict + the WHY flow: only appears on a rough day, optional, saves as you tap. */
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
  const [noteOpen, setNoteOpen] = useState(Boolean(entry.note));
  const [note, setNote] = useState(entry.note);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const bad = entry.mood === "bad";

  const [save, setSave] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const latest = useRef(entry.note);
  const saved = useRef(entry.note);

  async function flush(v: string) {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    if (v === saved.current) return;
    setSave("saving");
    const ok = await onNote(v);
    if (ok) saved.current = v;
    setSave(ok ? "saved" : "error");
  }

  // leaving the day (or the page section) with an unsaved pause: save it now
  useEffect(
    () => () => {
      if (timer.current) {
        clearTimeout(timer.current);
        if (latest.current !== saved.current) onNote(latest.current);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

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

      <div className="fold" data-open={bad} inert={!bad}>
        <div>
          <div className="pt-5">
            <p className="text-sm font-semibold">What got in the way?</p>
            <p className="mb-1 text-xs text-ink/55">Optional. Tap what fits, it saves itself.</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {WHY_TAGS.map((t) => {
                const on = entry.tags.includes(t.id);
                return (
                  <Chip
                    key={t.id}
                    on={on}
                    onClick={() => onTags(on ? entry.tags.filter((x) => x !== t.id) : [...entry.tags, t.id])}
                  >
                    {t.label}
                  </Chip>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* a note is just a note for the day: any mood, or none */}
      <div className="pt-4">
        <button
          type="button"
          onClick={() => setNoteOpen((v) => !v)}
          aria-expanded={noteOpen}
          className="flex items-center gap-1.5 text-sm font-medium text-ink/70 transition-colors hover:text-ink"
        >
          {noteOpen ? <Minus size={15} /> : <Plus size={15} />}
          {noteOpen ? "Hide note" : note ? "Note for this day" : "Add a note"}
        </button>

        <div className="fold" data-open={noteOpen} inert={!noteOpen}>
          <div>
            <div className="pt-2">
              <textarea
                value={note}
                maxLength={NOTE_MAX}
                rows={4}
                onChange={(e) => {
                  const v = e.target.value;
                  setNote(v);
                  latest.current = v;
                  setSave("idle");
                  if (timer.current) clearTimeout(timer.current);
                  timer.current = setTimeout(() => flush(v), 1500);
                }}
                onBlur={() => flush(note)}
                placeholder="Anything worth remembering about today. Wins, vents, thoughts."
                className="w-full resize-none rounded-2xl border border-ink/15 bg-white/70 p-3 text-sm outline-none transition-colors placeholder:text-ink/40 focus:border-ink"
              />
              <div className="flex justify-between text-[11px] text-ink/45">
                <span aria-live="polite" className={save === "error" ? "text-bad" : ""}>
                  {save === "saving" ? "Saving…" : save === "saved" ? "Saved" : save === "error" ? "Couldn’t save" : ""}
                </span>
                <span>
                  {note.length}/{NOTE_MAX}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
