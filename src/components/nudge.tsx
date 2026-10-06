"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { buildCheckin, weekToken, type Step } from "@/lib/checkin";
import { DISMISS_COOKIE, serializeDismissed } from "@/lib/dismissed";
import { catchUp, listTitles, openDetails } from "@/lib/insights";
import { awayOf, type AwayReason, type HabitSpec } from "@/lib/spec";
import { prettyDate, type Entries } from "@/lib/tracker";
import { AwayChips } from "./away";
import { CheckinCard, type Walk } from "./checkin";

// A few quiet lines at the top of Today, never a popup and never a count of how you're doing:
//  - Monday to Wednesday: last week's gaps that still have no reason, with a short walk through them
//  - yesterday had planned things you never logged: one tap goes to that day to fill them in
//  - it's evening and today still has open sections
// All of them only look at what the mirror already knows, and each can be waved away. The first two are
// remembered (in a cookie, so the server already knows about it when it draws the page). A day that was
// away can be said so from either of the last two lines.

const EVENING = 20; // 8pm
const NONE: string[] = [];

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
  // two different things can be "open": nothing logged yet, or logged but still under its goal (5 of 8 glasses)
  const unlogged = open.filter((o) => o.short.length === 0).map((o) => o.title);
  const under = open.filter((o) => o.short.length > 0).map((o) => `${o.title} (${o.short.join(", ")})`);
  const showCatchUp = missed !== null && !dismissed.includes(missed.date);
  const showEvening = hour >= EVENING && open.length > 0;
  const showCheckin = walk !== null || (checkin !== null && !dismissed.includes(weekToken(checkin.monday)));
  if (!showCatchUp && !showEvening && !showCheckin) return null;

  function dismiss(token: string) {
    const next = [...dismissed, token].slice(-14);
    setDismissed(next);
    document.cookie = `${DISMISS_COOKIE}=${serializeDismissed(next)}; path=/; max-age=31536000; samesite=lax`;
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
      {showCatchUp && missed && (
        <div role="status" className="flex items-start gap-3 rounded-2xl border border-ink/10 bg-surface/70 px-4 py-3 text-sm">
          <div className="min-w-0 flex-1">
            <p className="leading-snug text-ink/85">
              <span className="font-semibold text-ink">{prettyDate(missed.date).split(",")[0]}</span> has {missed.titles.length} not logged:{" "}
              {listTitles(missed.titles)}.{" "}
              <button type="button" onClick={() => onFill(missed.date)} className="font-semibold text-ink underline underline-offset-2">
                Fill in
              </button>
              <span className="text-soft" aria-hidden>
                {" · "}
              </span>
              <button type="button" onClick={() => setAwayLine((l) => (l === "yesterday" ? null : "yesterday"))} aria-expanded={awayLine === "yesterday"} className="font-semibold text-ink underline underline-offset-2">
                Away?
              </button>
            </p>
            {awayLine === "yesterday" && (
              <div className="mt-2">
                <p className="mb-1.5 text-xs text-soft">Was it a day you were away? Nothing on it will count as a gap.</p>
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
          </div>
          <button
            type="button"
            onClick={() => dismiss(missed.date)}
            aria-label="Not now"
            className="-mr-1 flex size-6 shrink-0 items-center justify-center rounded-full text-soft transition-colors hover:text-ink"
          >
            <X size={14} />
          </button>
        </div>
      )}
      {showEvening && (
        <div role="status" className="rounded-2xl bg-surface/50 px-4 py-2.5 text-sm leading-snug text-ink/85">
          <p>
            {unlogged.length > 0 && `${unlogged.length === 1 ? "1 thing" : `${unlogged.length} things`} still open today: ${listTitles(unlogged)}.`}
            {unlogged.length > 0 && under.length > 0 && " "}
            {under.length > 0 && `Still short of your goal today: ${listTitles(under)}.`}{" "}
            <button type="button" onClick={() => setAwayLine((l) => (l === "today" ? null : "today"))} aria-expanded={awayLine === "today"} className="font-semibold text-ink underline underline-offset-2">
              Away today?
            </button>
          </p>
          {awayLine === "today" && (
            <div className="mt-2">
              <p className="mb-1.5 text-xs text-soft">Sick, travelling, resting? Nothing today will count as a gap.</p>
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
        </div>
      )}
    </div>
  );
}
