"use client";

import { useState } from "react";
import { Armchair, CalendarOff, Plane, Thermometer, type LucideIcon } from "lucide-react";
import { AWAY_REASONS, awayLabel, type AwayReason } from "@/lib/spec";
import { Fold } from "./fold";
import { Chip } from "./ui";

// Away days. Sick, travelling or resting: the day isn't judged, so nothing on it is a gap and it never
// breaks a run (see lib/mirror). These are the small pieces that say so on Today; the rules are in lib.

const ICON: Record<AwayReason, LucideIcon> = { sick: Thermometer, travel: Plane, rest: Armchair, other: CalendarOff };

export function AwayIcon({ reason, size = 20 }: { reason: AwayReason; size?: number }) {
  const Icon = ICON[reason];
  return <Icon size={size} strokeWidth={1.8} />;
}

/** The reasons, as chips. Tapping the one that's on clears it (the day is a normal day again). */
export function AwayChips({ value, onPick }: { value: AwayReason | null; onPick: (reason: AwayReason | null) => void }) {
  return (
    <div role="group" aria-label="Why was this day away?" className="flex flex-wrap gap-1.5">
      {AWAY_REASONS.map((r) => (
        <Chip key={r.id} small on={value === r.id} onClick={() => onPick(value === r.id ? null : r.id)}>
          {r.label}
        </Chip>
      ))}
    </div>
  );
}

/** A quiet line at the end of a normal day: "Not a normal day? Mark it away". */
export function AwayLink({ onPick }: { onPick: (reason: AwayReason) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-4 border-t border-ink/10 pt-3">
      <button type="button" aria-expanded={open} onClick={() => setOpen((o) => !o)} className="text-left text-sm text-soft hover:text-ink">
        Not a normal day? <span className="font-medium text-ink underline underline-offset-2">Mark it away</span>
      </button>
      <Fold open={open}>
        <div className="pt-3">
          <p className="mb-2 text-xs text-soft">Sick, travelling, resting. Nothing on an away day counts as a gap, and anything you log still shows.</p>
          <AwayChips
            value={null}
            onPick={(r) => {
              if (!r) return;
              onPick(r);
              setOpen(false);
            }}
          />
        </div>
      </Fold>
    </div>
  );
}

/** Shown at the top of an away day, so it's obvious why nothing is asking for anything. */
export function AwayBanner({ reason, isToday, onPick }: { reason: AwayReason; isToday: boolean; onPick: (reason: AwayReason | null) => void }) {
  const [changing, setChanging] = useState(false);
  return (
    <section className="card p-4" role="status">
      <div className="flex items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-lilac/50">
          <AwayIcon reason={reason} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">
            {isToday ? "Away today" : "An away day"}: {awayLabel(reason).toLowerCase()}
          </p>
          <p className="mt-0.5 text-xs text-soft">Nothing counts as a gap, and anything you log still shows.</p>
        </div>
        <button type="button" onClick={() => onPick(null)} className="shrink-0 rounded-full border border-ink/15 px-3 py-1.5 text-xs font-medium transition-colors hover:border-ink/40">
          Not away
        </button>
      </div>
      <button type="button" aria-expanded={changing} onClick={() => setChanging((c) => !c)} className="mt-2 text-xs font-medium text-ink underline underline-offset-2">
        Change why
      </button>
      <Fold open={changing}>
        <div className="pt-2">
          <AwayChips
            value={reason}
            onPick={(r) => {
              onPick(r);
              setChanging(false);
            }}
          />
        </div>
      </Fold>
    </section>
  );
}

/** Stands where the progress ring would: an away day has nothing to add up. Same size, so the header doesn't move. */
export function AwayBadge({ reason, size = 52 }: { reason: AwayReason; size?: number }) {
  return (
    <div
      role="img"
      aria-label={`Away: ${awayLabel(reason).toLowerCase()}`}
      title={`Away: ${awayLabel(reason).toLowerCase()}`}
      className="flex shrink-0 items-center justify-center rounded-full border-2 border-dashed border-ink/35"
      style={{ width: size, height: size }}
    >
      <AwayIcon reason={reason} size={22} />
    </div>
  );
}
