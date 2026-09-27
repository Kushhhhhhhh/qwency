"use client";

import { useRef, useState } from "react";
import { completion, dayProgress, totalSections, type HabitSpec } from "@/lib/spec";
import { statTiles } from "@/lib/insights";
import {
  FOCUS_MAX,
  WEEKDAYS,
  WHY_TAGS,
  addDays,
  daysInMonth,
  monthOf,
  shortDate,
  weekdayIndex,
  type Entries,
  type Mood,
} from "@/lib/tracker";

const WEEKS = 17;
const MOOD_VAR: Record<Mood, string> = {
  good: "var(--color-good)",
  meh: "var(--color-meh)",
  bad: "var(--color-bad)",
};

type Props = {
  entries: Entries;
  today: string;
  focus: string;
  streak: number;
  selected: string;
  spec: HabitSpec;
  pulse: { date: string; n: number };
  onPick: (date: string) => void;
  onFocus: (month: string, text: string) => void;
};

export function Overview(p: Props) {
  return (
    <div className="flex flex-col gap-4">
      <MonthCard {...p} />
      <Contributions {...p} />
      <Stats entries={p.entries} today={p.today} spec={p.spec} />
      <Reasons entries={p.entries} />
    </div>
  );
}

/* ------------------------------ monthly = direction ------------------------------ */

const MILESTONES = [3, 7, 14, 30, 60, 100];

function MonthCard({ entries, today, focus, streak, spec, onFocus }: Props) {
  const month = monthOf(today);
  const daysInThisMonth = daysInMonth(month);
  const dayOfMonth = Number(today.slice(8));
  const [text, setText] = useState(focus);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const total = totalSections(spec);
  const keys = Array.from({ length: daysInThisMonth }, (_, i) => `${month}-${String(i + 1).padStart(2, "0")}`);
  const logged = keys.filter((k) => completion(entries[k], spec) > 0).length;
  const next = MILESTONES.find((m) => m > streak);

  return (
    <section className="tile tile-lilac p-5">
      <p className="text-xs font-medium uppercase tracking-wider text-ink/70">This month · direction</p>
      <input
        value={text}
        maxLength={FOCUS_MAX}
        onChange={(e) => {
          const v = e.target.value;
          setText(v);
          if (timer.current) clearTimeout(timer.current);
          timer.current = setTimeout(() => onFocus(month, v), 1500);
        }}
        onBlur={() => {
          if (timer.current) clearTimeout(timer.current);
          if (text !== focus) onFocus(month, text);
        }}
        placeholder="Where am I heading this month?"
        className="mt-2 w-full border-b border-ink/25 bg-transparent pb-2 text-lg font-medium outline-none transition-colors placeholder:text-ink/50 focus:border-ink"
      />

      <div className="mt-4 flex items-center justify-between text-sm">
        <span>
          <b className="text-xl font-semibold tabular-nums">{logged}</b>
          <span className="text-ink/75"> / {dayOfMonth} days logged</span>
        </span>
        <span className="rounded-full bg-white/60 px-3 py-1 text-xs font-semibold">
          {streak > 0 ? `${streak}-day streak` : "No streak yet"}
        </span>
      </div>

      <div className="mt-3 flex h-2 gap-[2px]">
        {keys.map((k) => {
          const n = dayProgress(entries[k], k, spec);
          return (
            <i
              key={k}
              className="h-full flex-1 rounded-full transition-colors duration-300"
              style={{
                background:
                  n > 0
                    ? `color-mix(in oklab, var(--color-ink) ${25 + (n / total) * 75}%, transparent)`
                    : k > today
                      ? "transparent"
                      : "color-mix(in oklab, var(--color-ink) 10%, transparent)",
              }}
            />
          );
        })}
      </div>
      <p className="mt-3 text-xs text-ink/70">
        {streak > 0 && next ? `${next - streak} more days to a ${next}-day streak.` : "Log something today to start one."}
      </p>
    </section>
  );
}

/* ------------------------------ weekly = awareness ------------------------------ */

function Contributions({ entries, today, selected, spec, pulse, onPick }: Props) {
  const [mode, setMode] = useState<"progress" | "mood">("progress");
  const total = totalSections(spec);
  const thisMonday = addDays(today, -weekdayIndex(today));
  const start = addDays(thisMonday, -(WEEKS - 1) * 7);
  const days = Array.from({ length: WEEKS * 7 }, (_, i) => addDays(start, i));

  const week = days.slice(-7).filter((d) => d <= today);
  const weekDone = week.reduce((a, d) => a + dayProgress(entries[d], d, spec), 0);
  const weekMax = week.length * total;

  function bg(d: string) {
    const e = entries[d];
    const n = dayProgress(e, d, spec);
    if (mode === "mood") {
      if (e?.mood) return MOOD_VAR[e.mood];
      if (n > 0) return "color-mix(in oklab, var(--color-ink) 18%, transparent)";
    } else if (n > 0) {
      return `color-mix(in oklab, var(--color-ink) ${20 + (n / total) * 80}%, transparent)`;
    }
    return "color-mix(in oklab, var(--color-ink) 7%, transparent)";
  }

  return (
    <section className="tile tile-meh p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-ink/70">Weekly · awareness</p>
          <p className="mt-1 text-sm">
            This week: <b>{weekDone}</b>
            <span className="text-ink/75"> / {weekMax} things logged</span>
          </p>
        </div>
        <div className="flex rounded-full border border-ink/10 bg-white/60 p-0.5 text-xs font-medium">
          {(["progress", "mood"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className={`rounded-full px-3 py-1 capitalize transition-colors ${
                mode === m ? "bg-ink text-cream" : "text-ink/75 hover:text-ink"
              }`}
            >
              {m}
            </button>
          ))}
        </div>
      </div>

      <div className="no-scrollbar mt-4 flex gap-2 overflow-x-auto pb-1">
        <div className="grid shrink-0 grid-rows-7 gap-[3px] text-[9px] leading-none text-ink/65">
          {WEEKDAYS.map((d, i) => (
            <span key={d} className="flex items-center">
              {i % 2 === 0 ? d : ""}
            </span>
          ))}
        </div>
        <div className="grid min-w-0 flex-1 grid-flow-col grid-rows-7 gap-[3px]">
          {days.map((d, i) => {
            const popped = pulse.date === d;
            const future = d > today;
            return (
              <button
                key={popped ? `${d}-${pulse.n}` : d}
                type="button"
                disabled={future}
                onClick={() => onPick(d)}
                aria-label={`${shortDate(d)}: ${dayProgress(entries[d], d, spec)} of ${total} logged`}
                title={future ? "" : `${shortDate(d)} · ${dayProgress(entries[d], d, spec)}/${total} logged`}
                style={{
                  background: bg(d),
                  animationDelay: popped ? undefined : `${Math.floor(i / 7) * 16}ms`,
                }}
                className={`aspect-square min-w-[14px] rounded-[4px] transition-transform hover:scale-125 ${
                  future ? "invisible" : ""
                } ${popped ? "cell-in" : "rise"} ${d === selected ? "ring-2 ring-ink ring-offset-1 ring-offset-cream" : ""}`}
              />
            );
          })}
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between text-[11px] text-ink/70">
        <span>Tap a day to open it.</span>
        <span className="flex items-center gap-1">
          {mode === "progress" ? "less" : "rough"}
          {(mode === "progress"
            ? [0.07, 0.3, 0.5, 0.75, 1].map((o) => `color-mix(in oklab, var(--color-ink) ${o * 100}%, transparent)`)
            : [MOOD_VAR.bad, MOOD_VAR.meh, MOOD_VAR.good]
          ).map((c) => (
            <i key={c} className="inline-block size-3 rounded-[3px]" style={{ background: c }} />
          ))}
          {mode === "progress" ? "more" : "good"}
        </span>
      </div>
    </section>
  );
}

/* ------------------------------ what the data says so far ------------------------------ */
// Derived straight from *this user's own* spec (whatever sections and fields they've set up),
// never hardcoded to any one person's trackers — see lib/insights.ts.

const TILE_TONE_TEXT: Record<string, string> = { good: "text-good", meh: "text-meh", bad: "text-bad" };

function Stats({ entries, today, spec }: { entries: Entries; today: string; spec: HabitSpec }) {
  const tiles = statTiles(spec, entries, today);
  if (tiles.length === 0) return null;

  return (
    <section>
      <p className="px-1 text-xs font-medium uppercase tracking-wider text-ink/50">Your numbers so far</p>
      <p className="mb-2 px-1 text-xs text-ink/50">
        One tile per question from your own Setup, calculated from the last 30 days.
      </p>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {tiles.map((t) => (
          <div key={t.key} className="card px-4 py-3">
            <p className="truncate text-[10px] font-semibold uppercase tracking-wider text-ink/40">{t.section}</p>
            <p className={`mt-0.5 text-xl font-semibold tabular-nums ${t.tone ? TILE_TONE_TEXT[t.tone] : ""}`}>{t.value}</p>
            <p className="truncate text-xs font-medium">{t.question}</p>
            <p className="text-[11px] text-ink/50">{t.context}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ------------------------------ reasons = truth ------------------------------ */

function Reasons({ entries }: { entries: Entries }) {
  const bad = Object.entries(entries).filter(([, e]) => e.mood === "bad");
  const counts = WHY_TAGS.map((t) => ({ ...t, n: bad.filter(([, e]) => e.tags.includes(t.id)).length }))
    .filter((t) => t.n > 0)
    .sort((a, b) => b.n - a.n);
  const max = counts[0]?.n ?? 1;
  const untagged = bad.filter(([, e]) => e.tags.length === 0).length;

  const perWeekday = WEEKDAYS.map((_, i) => bad.filter(([k]) => weekdayIndex(k) === i).length);
  const worst = Math.max(...perWeekday);
  const worstDay = worst >= 2 ? WEEKDAYS[perWeekday.indexOf(worst)] : null;

  return (
    <section className="tile tile-good p-5">
      <p className="text-xs font-medium uppercase tracking-wider text-ink/70">Reasons · truth</p>
      <h2 className="mt-1 text-base font-semibold">Why days go rough</h2>

      {counts.length === 0 ? (
        <p className="mt-2 text-sm text-ink/75">
          Nothing yet. Mark a day as rough and tap what got in the way, and the pattern shows up here.
        </p>
      ) : (
        <ul className="mt-3 space-y-2.5">
          {counts.map((t) => (
            <li key={t.id} className="flex items-center gap-3 text-sm">
              <span className="w-28 shrink-0">{t.label}</span>
              <span
                className="h-2.5 rounded-full bg-bad transition-[width] duration-500"
                style={{ width: `${(t.n / max) * 55}%`, minWidth: 10 }}
              />
              <span className="font-semibold tabular-nums">{t.n}</span>
            </li>
          ))}
        </ul>
      )}

      {(worstDay || untagged > 0) && (
        <p className="mt-4 text-xs text-ink/75">
          {worstDay && <>Rough days cluster on {worstDay}s ({worst}). </>}
          {untagged > 0 && <>{untagged} rough {untagged === 1 ? "day has" : "days have"} no reason yet.</>}
        </p>
      )}
    </section>
  );
}
