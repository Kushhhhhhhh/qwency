"use client";

import { useState } from "react";
import { AWAY_REASONS, awayLabel, awayOf, dayDone, dayTotal, hasActivity, specAt, type HabitSpec } from "@/lib/spec";
import { buildMirrorOver, type Cell, type CellState, type RowMirror } from "@/lib/mirror";
import { cleanRun, findLinks, trendLine, weekdayShape, type Link, type Trend } from "@/lib/insights";
import type { MonthPlan } from "@/lib/goals";
import { iconFor } from "@/lib/icons";
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
import { MonthCard, MonthReview, worthReviewing } from "./month";

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
 * Patterns, top to bottom: where the month is heading (direction), then the mirror (Reality, Gap,
 * Reason: first for everything together, then for each section against its own schedule), with the
 * heatmap underneath as context. The mirror can look at the last 7 or 30 days, or a calendar
 * month. Goal arithmetic lives in lib/goals.ts, the mirror's in lib/mirror.ts.
 */
export function Overview(p: Props) {
  const [view, setView] = useState<View>("7");
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
  // the last 90 days are read three ways (the run without a gap, what goes with what): built once
  const m90 = buildMirrorOver(p.spec, p.entries, p.today, trailing(90));
  const run = cleanRun(p.spec, p.entries, p.today, 90, m90);
  const links = findLinks(p.spec, p.entries, p.today, 90, 2, m90);

  const common = { entries: p.entries, today: p.today, spec: p.spec, onPlan: p.onPlan };
  // a month that just ended is looked at for its first ten days, if it had a plan worth looking back at
  const reviewing = Number(p.today.slice(8)) <= 10 && worthReviewing(p.plans[lastMonth], p.focuses[lastMonth] ?? "");

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
        run={run}
        onFocus={p.onFocus}
      />
      <Hero
        mirror={mirror}
        value={view}
        onChange={setView}
        trend={trend}
        shape={shape}
        options={[
          { id: "7", label: "7 days" },
          { id: "30", label: "30 days" },
          { id: "this", label: monthName(thisMonth, "short") },
          { id: "last", label: monthName(lastMonth, "short") },
        ]}
      />
      <Noticing links={links} />
      {(mirror.totals.planned > 0 || mirror.away.length > 0) && <Legend withAway={mirror.away.length > 0} />}
      {mirror.rows.map((r) => (
        <Row key={r.id} row={r} compact={dates.length > 7} onPick={p.onPick} onSetup={p.onSetup} />
      ))}
      <Heatmap {...p} />
    </div>
  );
}

/* ------------------------------ the hero ------------------------------ */

function Hero({
  mirror,
  value,
  onChange,
  trend,
  shape,
  options,
}: {
  mirror: ReturnType<typeof buildMirrorOver>;
  value: View;
  onChange: (v: View) => void;
  trend: Trend | null;
  shape: ReturnType<typeof weekdayShape>;
  options: { id: View; label: string }[];
}) {
  const { totals, reasons, startedOn } = mirror;
  const windowStart = mirror.rows[0]?.cells[0]?.date ?? "";
  const partial = startedOn !== null && startedOn > windowStart;

  return (
    <section className="tile tile-meh p-5">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-medium uppercase tracking-wider text-soft">The mirror</p>
        <div className="flex rounded-full border border-ink/10 bg-surface/70 p-0.5 text-xs font-medium">
          {options.map((o) => (
            <button
              key={o.id}
              type="button"
              onClick={() => onChange(o.id)}
              aria-pressed={value === o.id}
              className={`rounded-full px-2.5 py-1 transition-colors ${
                value === o.id ? "bg-ink text-cream" : "text-soft hover:text-ink"
              }`}
            >
              {o.label}
            </button>
          ))}
        </div>
      </div>

      {startedOn === null ? (
        <p className="mt-3 text-base font-semibold leading-snug">Nothing logged yet. Tap in today and the mirror starts here.</p>
      ) : totals.planned === 0 ? (
        <p className="mt-3 text-base font-semibold leading-snug">
          {mirror.away.length > 0 ? "Everything in this window was an away day, so there is nothing to count." : "Nothing has come due in this window yet."}
        </p>
      ) : (
        <>
          <p className="mt-3 text-lg font-semibold leading-snug">
            You planned {totals.planned}. You did {totals.done}.
            {totals.gaps > 0 ? ` That leaves ${totals.gaps} ${totals.gaps === 1 ? "gap" : "gaps"}.` : " No gaps."}
          </p>
          {trend && <p className="mt-1 text-sm text-ink/85">{trend.text}</p>}
          {shape && (
            <p className="mt-1 text-sm text-ink/85">
              {shape.day} are where it slips most: {shape.gaps} of {shape.planned} planned missed.
            </p>
          )}

          <div className="mt-4 grid grid-cols-3 gap-2">
            <Stat kicker="Reality" value={String(totals.done)} caption={`of ${totals.planned} planned`} />
            <Stat
              kicker="Gap"
              value={String(totals.gaps)}
              caption={
                totals.gaps === 0
                  ? "none"
                  : [totals.slipped ? `${totals.slipped} slipped` : "", totals.blank ? `${totals.blank} not logged` : ""].filter(Boolean).join(" · ")
              }
            />
            <Stat
              kicker="Reason"
              value={totals.gaps === 0 ? "—" : `${totals.explained}/${totals.gaps}`}
              caption={totals.gaps === 0 ? "nothing to explain" : "explained"}
            />
          </div>

          {mirror.away.length > 0 && (
            <p className="mt-3 text-sm text-ink/85">
              Away: {mirror.away.length} {mirror.away.length === 1 ? "day" : "days"} ({awayWords(mirror.away)}). Not counted.
            </p>
          )}

          {reasons.length > 0 && (
            <div className="mt-4">
              <p className="mb-2 text-xs font-medium uppercase tracking-wider text-soft">What got in the way</p>
              <div className="flex flex-wrap gap-1.5">
                {reasons.slice(0, 6).map((r) => (
                  <span key={r.label} className="rounded-full bg-surface/70 px-3 py-1 text-sm font-medium">
                    {r.label} <span className="text-soft">×{r.n}</span>
                  </span>
                ))}
              </div>
            </div>
          )}

          {totals.unexplained > 0 && (
            <p className="mt-4 text-sm text-soft">
              {totals.unexplained} {totals.unexplained === 1 ? "gap has" : "gaps have"} no reason yet. Tap a square below to add one — no judgment.
            </p>
          )}

          {partial && startedOn && (
            <p className="mt-3 text-xs text-soft">Counting from {shortDate(startedOn)}, your first day.</p>
          )}
        </>
      )}
    </section>
  );
}

/** Patterns the data shows between sections, in counts, never as a claim about why. */
function Noticing({ links }: { links: Link[] }) {
  if (links.length === 0) return null;
  return (
    <section className="card p-5">
      <p className="text-xs font-medium uppercase tracking-wider text-soft">Worth noticing</p>
      <ul className="mt-2 flex flex-col gap-2.5">
        {links.map((l) => (
          <li key={l.text} className="text-[15px] leading-snug">
            {l.text}
          </li>
        ))}
      </ul>
      <p className="mt-3 text-xs text-soft">From your last 90 days. What went together so far, not proof of cause.</p>
    </section>
  );
}

function Stat({ kicker, value, caption }: { kicker: string; value: string; caption: string }) {
  return (
    <div className="rounded-2xl bg-surface/60 px-3 py-3">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-soft">{kicker}</p>
      <p className="mt-0.5 text-2xl font-semibold tabular-nums leading-none">{value}</p>
      <p className="mt-1 text-xs leading-tight text-soft">{caption}</p>
    </div>
  );
}

/* ------------------------------ the squares ------------------------------ */

const CELL: Record<CellState, string> = {
  done: "bg-ink text-cream",
  slipped: "bg-bad text-onpastel",
  blank: "border border-dashed border-ink/40 bg-surface/50 text-soft",
  open: "border border-ink/25 bg-surface text-soft",
  off: "bg-ink/5 text-ink/25",
  extra: "bg-ink/40 text-cream",
  away: "away-hatch bg-lilac/40 text-ink",
};
const CELL_WORD: Record<CellState, string> = {
  done: "done",
  slipped: "slipped",
  blank: "not logged",
  open: "still open today",
  off: "not planned",
  extra: "done, though not planned",
  away: "away",
};

/** "2 sick, 1 travelling": the away days in a window, by why. */
function awayWords(days: { reason: (typeof AWAY_REASONS)[number]["id"] }[]) {
  return AWAY_REASONS.map((r) => ({ r, n: days.filter((d) => d.reason === r.id).length }))
    .filter((x) => x.n > 0)
    .map((x) => `${x.n} ${awayLabel(x.r.id).toLowerCase()}`)
    .join(", ");
}

function Legend({ withAway }: { withAway: boolean }) {
  const items: [CellState, string][] = [
    ["done", "Done"],
    ["slipped", "Slipped"],
    ["blank", "Not logged"],
    ["off", "Not planned"],
    ...(withAway ? [["away", "Away"] as [CellState, string]] : []),
  ];
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-1 text-xs text-soft">
      {items.map(([st, label]) => (
        <span key={st} className="flex items-center gap-1.5">
          <i className={`inline-block size-3 rounded-[3px] ${CELL[st]}`} />
          {label}
        </span>
      ))}
    </div>
  );
}

function Squares({ cells, compact, onPick }: { cells: Cell[]; compact: boolean; onPick: (d: string) => void }) {
  return (
    <div className="flex gap-0.75">
      {cells.map((c) => (
        <button
          key={c.date}
          type="button"
          onClick={() => onPick(c.date)}
          aria-label={`${shortDate(c.date)}: ${CELL_WORD[c.state]}`}
          title={`${shortDate(c.date)} · ${CELL_WORD[c.state]}`}
          className={`min-w-0 flex-1 rounded-md text-[11px] font-medium transition-transform active:scale-90 ${
            compact ? "h-4" : "h-8"
          } ${CELL[c.state]}`}
        >
          {!compact && WEEKDAYS[weekdayIndex(c.date)][0]}
        </button>
      ))}
    </div>
  );
}

/* ------------------------------ one section, mirrored ------------------------------ */

function Row({
  row,
  compact,
  onPick,
  onSetup,
}: {
  row: RowMirror;
  compact: boolean;
  onPick: (d: string) => void;
  onSetup: (sectionId: string) => void;
}) {
  const Icon = iconFor(row.icon);
  const gapWords = [row.slipped ? `${row.slipped} slipped` : "", row.blank ? `${row.blank} not logged` : ""].filter(Boolean).join(", ");

  return (
    <section className="card p-4">
      <header className="flex items-center gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-2xl bg-lilac/50">
          <Icon size={18} strokeWidth={1.8} />
        </span>
        <h2 className="min-w-0 flex-1 truncate text-base font-semibold">{row.title}</h2>
        <span className="shrink-0 rounded-full bg-ink/5 px-2.5 py-1 text-xs font-medium text-soft">{row.schedule}</span>
      </header>

      <div className="mt-3">
        <Squares cells={row.cells} compact={compact} onPick={onPick} />
      </div>

      {/* the line this row is measured against, so a "slip" is never a mystery */}
      <p className="mt-2 text-xs text-soft">
        {row.rules.length > 0 ? (
          <>Slips if: {row.rules.join(" · ")}</>
        ) : (
          <>
            Nothing here can slip yet, so only missed days count.{" "}
            <button type="button" onClick={() => onSetup(row.id)} className="font-medium text-ink underline underline-offset-2">
              Set a target
            </button>
          </>
        )}
      </p>
      {row.rulesChangedOn && (
        <p className="mt-1 text-xs text-soft">Rules changed {shortDate(row.rulesChangedOn)}. Earlier days keep the old ones.</p>
      )}

      {row.planned === 0 ? (
        <p className="mt-3 text-sm text-soft">Nothing planned in this window yet.</p>
      ) : (
        <dl className="mt-3 space-y-1.5 text-sm">
          <Line label="Reality">
            Done {row.done} of {row.planned} planned {row.planned === 1 ? "day" : "days"}.
          </Line>
          <Line label="Gap">{row.gaps === 0 ? "No gaps." : `${row.gaps} missed — ${gapWords}.`}</Line>
          {row.gaps > 0 && (
            <Line label="Reason">
              {row.reasons.length > 0 && row.reasons.map((r) => `${r.label} ×${r.n}`).join(" · ")}
              {row.reasons.length > 0 && row.unexplained > 0 && " · "}
              {row.unexplained > 0 && <span className="text-soft">{row.unexplained} unexplained</span>}
              {row.reasons.length === 0 && row.unexplained === 0 && "Noted in your words."}
            </Line>
          )}
        </dl>
      )}

      {row.where.length > 0 && (
        <p className="mt-3 text-sm">
          <span className="text-xs font-semibold uppercase tracking-wider text-soft">Where it went</span>
          <br />
          {row.where.map((w) => `${w.label} ${w.amount}`).join(" · ")}
        </p>
      )}

      {row.notes.length > 0 && (
        <ul className="mt-3 space-y-1.5 border-t border-ink/10 pt-3">
          {row.notes.map((n) => (
            <li key={n.date} className="text-[13px] leading-snug text-ink/85">
              “{n.text.length > 140 ? `${n.text.slice(0, 140)}…` : n.text}”{" "}
              <span className="text-soft">— {shortDate(n.date)}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Line({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3">
      <dt className="w-16 shrink-0 text-xs font-semibold uppercase tracking-wider text-soft pt-0.75">{label}</dt>
      <dd className="min-w-0 flex-1 text-ink/90">{children}</dd>
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
              className={`rounded-full px-3 py-1 capitalize transition-colors ${
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
