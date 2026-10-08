"use client";

import { useEffect, useRef, useState } from "react";
import { PenLine } from "lucide-react";
import { Fold } from "./fold";

// A note on a card: a small pen in the card's corner opens an auto-saving box under the answers. One pen per card
// (instead of a "+ Note" line under every one) keeps the answers themselves the loudest thing on the screen. Same
// debounce + on-blur + on-unmount behavior wherever a note lives: each section's note and the day's note.

/** The pen. It carries a dot when there's already a note, so you can tell without opening it. */
export function NoteButton({ open, filled, label, onClick }: { open: boolean; filled: boolean; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-expanded={open}
      aria-label={filled ? `${label}, has a note` : label}
      title={label}
      className="hit relative flex size-9 shrink-0 items-center justify-center rounded-full text-ink/85 transition-colors hover:text-ink"
    >
      <PenLine size={17} strokeWidth={1.9} />
      {filled && !open && <i aria-hidden className="absolute right-1 top-1 size-2 rounded-full bg-ink" />}
    </button>
  );
}

type BoxProps = {
  open: boolean;
  value: string;
  max: number;
  onSave: (v: string) => Promise<boolean>;
  placeholder?: string;
};

export function NoteBox({ open, value, max, onSave, placeholder = "Anything worth remembering about this." }: BoxProps) {
  const [text, setText] = useState(value);
  const [save, setSave] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const latest = useRef(value);
  const saved = useRef(value);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  async function flush(v: string) {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    if (v === saved.current) return;
    setSave("saving");
    const ok = await onSave(v);
    if (ok) saved.current = v;
    setSave(ok ? "saved" : "error");
  }

  // the latest onSave, for the cleanup below (which outlives the render that created it)
  const onSaveRef = useRef(onSave);
  useEffect(() => {
    onSaveRef.current = onSave;
  });

  // leaving the day (or the whole page) with an unsaved pause: save it now
  useEffect(
    () => () => {
      if (timer.current) {
        clearTimeout(timer.current);
        if (latest.current !== saved.current) void onSaveRef.current(latest.current);
      }
    },
    [],
  );

  return (
    <Fold open={open}>
      <div className="pt-3">
        <textarea
          value={text}
          maxLength={max}
          rows={3}
          onChange={(e) => {
            const v = e.target.value;
            setText(v);
            latest.current = v;
            setSave("idle");
            if (timer.current) clearTimeout(timer.current);
            timer.current = setTimeout(() => flush(v), 1500);
          }}
          onBlur={() => flush(text)}
          placeholder={placeholder}
          aria-label="Note"
          className="w-full resize-none rounded-2xl border border-ink/20 bg-surface/70 p-3 text-sm outline-none transition-colors placeholder:text-soft focus:border-ink"
        />
        <div className="flex justify-between text-xs text-soft">
          <span aria-live="polite" className={save === "error" ? "text-danger" : ""}>
            {save === "saving" ? "Saving…" : save === "saved" ? "Saved" : save === "error" ? "Couldn’t save" : ""}
          </span>
          <span>
            {text.length}/{max}
          </span>
        </div>
      </div>
    </Fold>
  );
}
