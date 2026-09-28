"use client";

import { useEffect, useRef, useState } from "react";
import { Minus, Plus } from "lucide-react";

// Collapsible auto-saving note. Same debounce + on-blur + on-unmount behavior wherever a
// note lives — the day-overall note and each section's optional note both use this.

type Props = {
  value: string;
  max: number;
  onSave: (v: string) => Promise<boolean>;
  placeholder?: string;
  openLabel?: string;
  closeLabel?: string;
  filledLabel?: string;
};

export function NoteField({
  value,
  max,
  onSave,
  placeholder = "Anything worth remembering about this.",
  openLabel = "Add a note",
  closeLabel = "Hide note",
  filledLabel = "Note",
}: Props) {
  const [open, setOpen] = useState(Boolean(value));
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

  // leaving the day (or the whole page) with an unsaved pause: save it now
  useEffect(
    () => () => {
      if (timer.current) {
        clearTimeout(timer.current);
        if (latest.current !== saved.current) onSave(latest.current);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  return (
    <div className="pt-4">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex items-center gap-1.5 text-sm font-medium text-ink/80 transition-colors hover:text-ink"
      >
        {open ? <Minus size={15} /> : <Plus size={15} />}
        {open ? closeLabel : text ? filledLabel : openLabel}
      </button>

      <div className="fold" data-open={open} inert={!open}>
        <div>
          <div className="pt-2">
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
              className="w-full resize-none rounded-2xl border border-ink/20 bg-white/70 p-3 text-sm outline-none transition-colors placeholder:text-ink/55 focus:border-ink"
            />
            <div className="flex justify-between text-[11px] text-ink/65">
              <span aria-live="polite" className={save === "error" ? "text-bad" : ""}>
                {save === "saving" ? "Saving…" : save === "saved" ? "Saved" : save === "error" ? "Couldn’t save" : ""}
              </span>
              <span>
                {text.length}/{max}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
