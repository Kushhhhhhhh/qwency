"use client";

import { useState } from "react";
import { awayOf, dayDone, dayTotal, hasActivity, specAt, type HabitSpec } from "@/lib/spec";
import { buildMirrorOver } from "@/lib/mirror";
import { cleanRun, trendLine, weekdayShape } from "@/lib/insights";
import type { MonthPlan } from "@/lib/goals";
import {
  WEEKDAYS,
  addDays,
  addMonths,
  monthDates,
  monthName,
  monthOf,
  shortDate,
  weekdayIndex,
  type Entries,
  type Mood,
} from "@/lib/tracker";
import { DayGrid, MirrorCard } from "./mirror-card";
import { MonthCard, MonthReview, worthReviewing } from "./month";
import { Noticing } from "./noticing";

const WEEKS = 10;
// an away day in the heatmap: diagonal lines over the faintest fill, so it reads as "not judged", not "nothing"
const HATCH =
  "repeating-linear-gradient(135deg, color-mix(in oklab, var(--color-ink) 40%, transparent) 0 2px, transparent 2px 5px), color-mix(in oklab, var(--color-ink) 6%, transparent)";
const MOOD_VAR: Record<Mood, string> = {
  good: "var(--color-good)",
  meh: "var(--color-meh)",
  bad: "var(--color-bad)",
};

type Props = {
  entries: Entries;
  today: string;
  focuses: Record<string, string>;
  plans: Record<string, MonthPlan>;
  selected: string;
  spec: HabitSpec;
  pulse: { date: string; n: number };
  onPick: (date: string) => void;
  onFocus: (month: string, text: string) => void;
  onPlan: (month: string, plan: MonthPlan) => void;
  /** open this section in Setup, e.g. to set what counts as a slip */
  onSetup: (sectionId: string) => void;
};

type View = "7" | "30" | "this" | "last";

/**
 * Patterns, top to bottom: last month's review (only until it's answered), this month's direction as one slim
 * line, then the mirror (what you did out of what you planned, and which sections were missed), one grid of the
 * whole window (a row per section, a square per day; a row opens for its detail), what's worth noticing, and the
 * heatmap underneath as context. The mirror looks at the last 7 or 30 days, or a calendar month. Goal arithmetic
 * lives in lib/goals.ts, the mirror's in lib/mirror.ts, what's worth noticing in lib/facts.ts.
 */
export function Overview(p: Props) {
  const [view, setView] = useState<View>("7");
  const [openRow, setOpenRow] = useState<string | null>(null);
  const thisMonth = monthOf(p.today);
  const lastMonth = addMonths(thisMonth, -1);

  const trailing = (n: number) => Array.from({ length: n }, (_, i) => addDays(p.today, -(n - 1 - i)));
  const dates =
    view === "7"
      ? trailing(7)
      : view === "30"
        ? trailing(30)
        : view === "this"
          ? monthDates(thisMonth).filter((d) => d <= p.today)
          : monthDates(lastMonth);
  const mirror = buildMirrorOver(p.spec, p.entries, p.today, dates);

  // the same stretch one step earlier, to say "more or fewer than before"
  const shift = (n: number) => dates.map((d) => addDays(d, -n));
  const earlier =
    view === "7"
      ? { dates: shift(7), label: "the 7 days before" }
      : view === "30"
        ? { dates: shift(30), label: "the 30 days before" }
        : view === "this"
          ? { dates: monthDates(lastMonth).slice(0, dates.length), label: `${monthName(lastMonth)} at this point` }
          : { dates: monthDates(addMonths(lastMonth, -1)), label: monthName(addMonths(lastMonth, -1)) };
  const trend = trendLine(p.spec, p.entries, p.today, dates, earlier.dates, earlier.label, mirror);
  const shape = weekdayShape(mirror);
  // the run with nothing missed is read over the last 90 days
  const run = cleanRun(p.spec, p.entries, p.today, 90, buildMirrorOver(p.spec, p.entries, p.today, trailing(90)));

  const common = { entries: p.entries, today: p.today, spec: p.spec, onPlan: p.onPlan };
  // a month that just ended is looked at for its first ten days, if it had a plan worth looking back at
  const reviewing = Number(p.today.slice(8)) <= 10 && worthReviewing(p.plans[lastMonth], p.focuses[lastMonth] ?? "");

  /** open a section's detail and bring it into view */
  function jump(id: string) {
    setOpenRow(id);
    requestAnimationFrame(() => requestAnimationFrame(() => document.getElementById(`mirror-row-${id}`)?.scrollIntoView({ behavior: "smooth", block: "center" })));
  }

  return (
    <div className="flex flex-col gap-4">
      {reviewing && <MonthReview {...common} month={lastMonth} focus={p.focuses[lastMonth] ?? ""} plan={p.plans[lastMonth] ?? { goals: [] }} />}
      <MonthCard
        {...common}
        month={thisMonth}
        focus={p.focuses[thisMonth] ?? ""}
        plan={p.plans[thisMonth] ?? { goals: [] }}
        lastMonth={lastMonth}
        lastPlan={p.plans[lastMonth]}
        onFocus={p.onFocus}
      />
      <MirrorCard
        mirror={mirror}
        value={view}
        onChange={(id) => {
          setView(id as View);
          setOpenRow(null);
        }}
        trend={trend}
        shape={shape}
        run={run}
        onJump={jump}
        options={[
          { id: "7", label: "7 days" },
          { id: "30", label: "30 days" },
          { id: "this", label: monthName(thisMonth, "short") },
          { id: "last", label: monthName(lastMonth, "short") },
        ]}
      />
      <DayGrid
        mirror={mirror}
        spec={p.spec}
        entries={p.entries}
        openRow={openRow}
        onToggle={(id) => setOpenRow((cur) => (cur === id ? null : id))}
        onPick={p.onPick}
        onSetup={p.onSetup}
      />
      <Noticing spec={p.spec} entries={p.entries} today={p.today} onPick={p.onPick} />
      <Heatmap {...p} />
    </div>
  );
}

/* ------------------------------ heatmap ------------------------------ */
// Sits on lilac on purpose: in Mood view its cells are green / yellow / orange, and a card
// in any of those colors would swallow its own cells.

function Heatmap({ entries, today, selected, spec, pulse, onPick }: Props) {
  const [mode, setMode] = useState<"progress" | "mood">("progress");
  const thisMonday = addDays(today, -weekdayIndex(today));
  const start = addDays(thisMonday, -(WEEKS - 1) * 7);
  const days = Array.from({ length: WEEKS * 7 }, (_, i) => addDays(start, i));

  const isAway = (d: string) => d <= today && awayOf(entries[d]) !== null;
  const anyAway = days.some(isAway);

  function bg(d: string) {
    const e = entries[d];
    if (mode === "mood") {
      if (e?.mood) return MOOD_VAR[e.mood];
      if (isAway(d)) return HATCH;
      if (hasActivity(e, spec)) return "color-mix(in oklab, var(--color-ink) 22%, transparent)";
    } else if (isAway(d)) {
      return HATCH;
    } else if (hasActivity(e, spec)) {
      // measured against what was planned that day, so a light weekend isn't a poor one
      const then = specAt(spec, d);
      const share = dayDone(e, d, then) / dayTotal(then, d);
      return `color-mix(in oklab, var(--color-ink) ${25 + share * 75}%, transparent)`;
    }
    return "color-mix(in oklab, var(--color-ink) 6%, transparent)";
  }

  return (
    <section className="tile tile-lilac p-5">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-medium uppercase tracking-wider text-soft">Your last {WEEKS} weeks</p>
        <div className="flex rounded-full border border-ink/10 bg-surface/70 p-0.5 text-xs font-medium">
          {(["progress", "mood"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className={`hit-y rounded-full px-3 py-1 capitalize transition-colors ${
                mode === m ? "bg-ink text-cream" : "text-soft hover:text-ink"
              }`}
            >
              {m}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-4 rounded-2xl bg-surface/70 p-4">
        <div className="flex gap-3">
          <div className="flex shrink-0 flex-col gap-1.25 pt-0.75 text-[11px] leading-none text-soft">
            {WEEKDAYS.map((d, i) => (
              <span key={d} className="flex h-4.25 items-center">
                {i % 2 === 0 ? d : ""}
              </span>
            ))}
          </div>
          <div className="flex flex-1 justify-center gap-1.25">
            {Array.from({ length: WEEKS }, (_, week) => (
              <div key={week} className="flex flex-col gap-1.25">
                {Array.from({ length: 7 }, (_, day) => {
                  const d = days[week * 7 + day];
                  const popped = pulse.date === d;
                  const future = d > today;
                  const then = specAt(spec, d);
                  const done = dayDone(entries[d], d, then);
                  const planned = dayTotal(then, d);
                  return (
                    <button
                      key={popped ? `${d}-${pulse.n}` : d}
                      type="button"
                      disabled={future}
                      onClick={() => onPick(d)}
                      aria-label={isAway(d) ? `${shortDate(d)}: away` : `${shortDate(d)}: ${done} of ${planned} planned done`}
                      title={future ? "" : isAway(d) ? `${shortDate(d)} · away` : `${shortDate(d)} · ${done}/${planned} planned done`}
                      style={{ background: bg(d), animationDelay: popped ? undefined : `${week * 16}ms` }}
                      className={`size-4.25 shrink-0 rounded-[5px] transition-transform ${future ? "invisible" : "hover:scale-110"} ${
                        popped ? "cell-in" : "rise"
                      } ${d === selected ? "ring-2 ring-ink" : ""}`}
                    />
                  );
                })}
              </div>
            ))}
          </div>
        </div>
        <p className="mt-3 text-xs text-soft">
          A stronger colour = more of what you planned that day.{anyAway ? " Hatched = an away day." : ""} Tap a day to open it.
        </p>
      </div>
    </section>
  );
}
