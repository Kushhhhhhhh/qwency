"use client";

import { useState } from "react";
import { X } from "lucide-react";

/**
 * Shown on Today only until the first thing is logged (it goes by itself then), so a new account isn't met by a wall
 * of questions with no word about them. It says the two things nobody can guess: nothing is required, and what the
 * ring and the dots under the days mean.
 */
export function FirstRun() {
  const [open, setOpen] = useState(true);
  if (!open) return null;
  return (
    <section className="card flex items-start gap-3 p-4" role="note" aria-label="How Today works">
      <div className="min-w-0 flex-1">
        <h2 className="text-base font-semibold leading-tight">Start anywhere</h2>
        <p className="mt-1 text-sm leading-snug text-soft">
          Tap what happened today, one thing at a time. Nothing is required, and anything you skip is fine. The ring at the top counts
          what&apos;s done, and the dots under the days light up on a full day.
        </p>
      </div>
      <button
        type="button"
        onClick={() => setOpen(false)}
        aria-label="Got it"
        className="hit -mr-1 flex size-6 shrink-0 items-center justify-center rounded-full text-soft transition-colors hover:text-ink"
      >
        <X size={14} />
      </button>
    </section>
  );
}
