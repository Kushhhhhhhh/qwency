"use client";

import { X } from "lucide-react";
import { reasonTags, weekWords, type Checkin, type Step } from "@/lib/checkin";
import { listTitles } from "@/lib/insights";
import { awayOf, type AwayReason } from "@/lib/spec";
import { WHY_TAGS, shortDate, type Entries } from "@/lib/tracker";
import { AwayChips } from "./away";
import { Chip } from "./ui";

// The Monday check-in, drawn. The card says what last week came to and how many gaps have no reason; "Add
// reasons" walks through them one question at a time with the reason chips you already know, and a way out
// for a day that was simply away. Everything here is quiet and skippable: nothing is required, nothing nags.

export type Walk = { monday: string; steps: Step[]; i: number };

export function CheckinCard({
  checkin,
  walk,
  entries,
  onStart,
  onNext,
  onReason,
  onAway,
  onClose,
}: {
  /** last week as it stands now (null once everything is explained, which can happen mid-walk) */
  checkin: Checkin | null;
  walk: Walk | null;
  entries: Entries;
  onStart: () => void;
  onNext: () => void;
  onReason: (step: Step, tags: string[]) => void;
  onAway: (date: string, reason: AwayReason | null) => void;
  /** done, or "not now": either way it isn't offered again this week */
  onClose: () => void;
}) {
  if (walk) {
    const step = walk.steps[walk.i];
    if (!step) return null;
    return <WalkStep walk={walk} step={step} entries={entries} onNext={onNext} onReason={onReason} onAway={onAway} onClose={onClose} />;
  }
  if (!checkin) return null;

  return (
    <section className="card p-4" aria-label="Last week">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium uppercase tracking-wider text-soft">Last week · {weekWords(checkin)}</p>
          <p className="mt-1 text-sm leading-snug text-ink/90">
            You planned {checkin.planned}. You did {checkin.done}. {checkin.open} {checkin.open === 1 ? "gap has" : "gaps have"} no reason yet.
          </p>
          <p className="mt-1 text-xs text-soft">
            {checkin.steps.length} quick {checkin.steps.length === 1 ? "step" : "steps"}: tap a reason, or mark a day away. No judgment.
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Not now"
          className="-mr-1 flex size-6 shrink-0 items-center justify-center rounded-full text-soft transition-colors hover:text-ink"
        >
          <X size={14} />
        </button>
      </div>
      <button type="button" onClick={onStart} className="mt-3 rounded-full bg-ink px-4 py-2 text-sm font-medium text-cream shadow-md shadow-shade/30 transition-transform active:scale-95">
        Add reasons
      </button>
    </section>
  );
}

function WalkStep({
  walk,
  step,
  entries,
  onNext,
  onReason,
  onAway,
  onClose,
}: {
  walk: Walk;
  step: Step;
  entries: Entries;
  onNext: () => void;
  onReason: (step: Step, tags: string[]) => void;
  onAway: (date: string, reason: AwayReason | null) => void;
  onClose: () => void;
}) {
  const entry = entries[step.date];
  const tags = reasonTags(entry, step);
  const last = walk.i === walk.steps.length - 1;
  const what =
    step.kind === "blank"
      ? `Not logged: ${listTitles(step.gaps.map((g) => g.title), 4)}`
      : step.kind === "day"
        ? "The day was Rough"
        : `${step.gaps[0].title}: ${step.gaps[0].what}`;

  return (
    <section className="card p-4" aria-label="Last week, add reasons">
      <div className="flex items-center gap-3">
        <p className="min-w-0 flex-1 text-xs font-medium uppercase tracking-wider text-soft">
          Last week · {walk.i + 1} of {walk.steps.length}
        </p>
        <button type="button" onClick={onClose} aria-label="Not now" className="-mr-1 flex size-6 shrink-0 items-center justify-center rounded-full text-soft transition-colors hover:text-ink">
          <X size={14} />
        </button>
      </div>

      <p className="mt-2 text-base font-semibold leading-tight">{shortDate(step.date)}</p>
      <p className="mt-0.5 text-sm text-ink/85">{what}</p>

      <p className="mb-2 mt-3 text-xs font-medium text-soft">What got in the way?</p>
      <div className="flex flex-wrap gap-1.5">
        {WHY_TAGS.map((t) => {
          const on = tags.includes(t.id);
          return (
            <Chip key={t.id} small on={on} onClick={() => onReason(step, on ? tags.filter((x) => x !== t.id) : [...tags, t.id])}>
              {t.label}
            </Chip>
          );
        })}
      </div>

      <p className="mb-2 mt-4 text-xs font-medium text-soft">Or the whole day was away</p>
      <AwayChips value={awayOf(entry)} onPick={(r) => onAway(step.date, r)} />

      <div className="mt-4 flex justify-end">
        <button type="button" onClick={onNext} className="rounded-full bg-ink px-5 py-2 text-sm font-medium text-cream shadow-md shadow-shade/30 transition-transform active:scale-95">
          {last ? "Done" : tags.length > 0 ? "Next" : "Skip"}
        </button>
      </div>
    </section>
  );
}
