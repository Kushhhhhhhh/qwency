"use client";

import { useState, type ReactNode } from "react";
import { X } from "lucide-react";
import { buildCheckin, weekToken, type Step } from "@/lib/checkin";
import { DISMISS_COOKIE, serializeDismissed } from "@/lib/dismissed";
import { catchUp, openDetails } from "@/lib/insights";
import { awayOf, type AwayReason, type HabitSpec } from "@/lib/spec";
import { prettyDate, type Entries } from "@/lib/tracker";
import { AwayChips } from "./away";
import { CheckinCard, type Walk } from "./checkin";

// A few quiet lines at the top of Today, never a popup and never a count of how you're doing:
//  - Monday to Wednesday: last week's misses that still have no reason, with a short walk through them
//  - yesterday had planned things you never logged: one tap goes to that day to fill them in
//  - it's evening and today still has open sections
// The last two share one box and one look. All of them only look at what the mirror already knows, and each can be
// waved away, and stays away (in a cookie, so the server already knows about it when it draws the page). A day that was
// away can be said so from either of the last two lines.

const EVENING = 20; // 8pm
const NONE: string[] = [];

/** Written to the cookie from out here: the compiler can't see that the buttons which call this only ever run on a tap. */
function remember(tokens: string[]) {
  document.cookie = `${DISMISS_COOKIE}=${serializeDismissed(tokens)}; path=/; max-age=31536000; samesite=lax`;
}

export function Nudges({
  spec,
  entries,
  today,
  selected,
  hour,
  dismissed: initialDismissed = NONE,
  onFill,
  onAway,
  onReason,
}: {
  spec: HabitSpec;
  entries: Entries;
  today: string;
  selected: string;
  hour: number;
  /** the days (and weeks, as "w" + Monday) whose lines were already waved away (from the cookie) */
  dismissed?: string[];
  onFill: (date: string) => void;
  /** say a day was away (or, with null, that it wasn't) */
  onAway: (date: string, reason: AwayReason | null) => void;
  /** save the reasons given for one question of the Monday check-in */
  onReason: (step: Step, tags: string[]) => void;
}) {
  const [dismissed, setDismissed] = useState(initialDismissed);
  // the check-in walk lives here, so it stays on screen while its last answer makes the card "complete"
  const [walk, setWalk] = useState<Walk | null>(null);
  const [awayLine, setAwayLine] = useState<"yesterday" | "today" | null>(null);

  if (selected !== today) return null;

  const missed = catchUp(spec, entries, today);
  const open = openDetails(spec, entries, today);
  const checkin = buildCheckin(spec, entries, today);
  const showCatchUp = missed !== null && !dismissed.includes(missed.date);
  const showEvening = hour >= EVENING && open.length > 0 && !dismissed.includes(`e${today}`);
  const showCheckin = walk !== null || (checkin !== null && !dismissed.includes(weekToken(checkin.monday)));
  if (!showCatchUp && !showEvening && !showCheckin) return null;

  function dismiss(token: string) {
    const next = [...dismissed, token].slice(-14);
    setDismissed(next);
    remember(next);
  }

  function closeCheckin(monday: string) {
    dismiss(weekToken(monday));
    setWalk(null);
  }

  /** The next question that still stands: one on a day that has just been marked away no longer does. */
  function go(w: Walk, from: number, awayDate?: string) {
    let j = from;
    while (j < w.steps.length && (w.steps[j].date === awayDate || awayOf(entries[w.steps[j].date]))) j++;
    if (j >= w.steps.length) closeCheckin(w.monday);
    else setWalk({ ...w, i: j });
  }

  return (
    <div className="flex flex-col gap-2">
      {showCheckin && (
        <CheckinCard
          checkin={checkin}
          walk={walk}
          entries={entries}
          onStart={() => checkin && setWalk({ monday: checkin.monday, steps: checkin.steps, i: 0 })}
          onNext={() => walk && go(walk, walk.i + 1)}
          onReason={onReason}
          onAway={(date, reason) => {
            onAway(date, reason);
            if (reason && walk) go(walk, walk.i + 1, date); // the day is away now: its other questions go with it
          }}
          onClose={() => {
            const monday = walk?.monday ?? checkin?.monday;
            if (monday) closeCheckin(monday);
          }}
        />
      )}
      {(showCatchUp || showEvening) && (
        <div role="status" className="overflow-hidden rounded-2xl border border-ink/10 bg-surface/60 text-sm">
          {showCatchUp && missed && (
            <Line onClose={() => dismiss(missed.date)}>
              <p className="leading-snug text-ink/85">
                <span className="font-semibold text-ink">{prettyDate(missed.date).split(",")[0]}</span>: {missed.titles.length} not logged.{" "}
                <button type="button" onClick={() => onFill(missed.date)} className="hit font-semibold text-ink underline underline-offset-2">
                  Fill in
                </button>
                <span className="text-soft" aria-hidden>
                  {" · "}
                </span>
                <button
                  type="button"
                  onClick={() => setAwayLine((l) => (l === "yesterday" ? null : "yesterday"))}
                  aria-expanded={awayLine === "yesterday"}
                  className="hit font-semibold text-ink underline underline-offset-2"
                >
                  Away?
                </button>
              </p>
              {awayLine === "yesterday" && (
                <div className="mt-2">
                  <p className="mb-1.5 text-xs text-soft">Was it a day you were away? Nothing on it will count as missed.</p>
                  <AwayChips
                    value={null}
                    onPick={(r) => {
                      if (!r) return;
                      onAway(missed.date, r);
                      setAwayLine(null);
                    }}
                  />
                </div>
              )}
            </Line>
          )}
          {showEvening && (
            <Line onClose={() => dismiss(`e${today}`)} divided={showCatchUp}>
              <p className="leading-snug text-ink/85">
                {open.length} {open.length === 1 ? "thing" : "things"} still open today.{" "}
                <button
                  type="button"
                  onClick={() => setAwayLine((l) => (l === "today" ? null : "today"))}
                  aria-expanded={awayLine === "today"}
                  className="hit font-semibold text-ink underline underline-offset-2"
                >
                  Away today?
                </button>
              </p>
              {awayLine === "today" && (
                <div className="mt-2">
                  <p className="mb-1.5 text-xs text-soft">Sick, travelling, resting? Nothing today will count as missed.</p>
                  <AwayChips
                    value={null}
                    onPick={(r) => {
                      if (!r) return;
                      onAway(today, r);
                      setAwayLine(null);
                    }}
                  />
                </div>
              )}
            </Line>
          )}
        </div>
      )}
    </div>
  );
}

/** One line in the box: its words, and the same small close button on every line. */
function Line({ children, onClose, divided }: { children: ReactNode; onClose: () => void; divided?: boolean }) {
  return (
    <div className={`flex items-start gap-3 px-4 py-3 ${divided ? "border-t border-ink/10" : ""}`}>
      <div className="min-w-0 flex-1">{children}</div>
      <button
        type="button"
        onClick={onClose}
        aria-label="Not now"
        className="hit -mr-1 flex size-6 shrink-0 items-center justify-center rounded-full text-soft transition-colors hover:text-ink"
      >
        <X size={14} />
      </button>
    </div>
  );
}
