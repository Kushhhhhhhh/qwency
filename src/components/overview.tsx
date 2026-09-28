"use client";

import { useRef, useState } from "react";
import { completion, dayProgress, totalSections, type HabitSpec } from "@/lib/spec";
import { statTiles } from "@/lib/insights";
import { reasonTally, weeklyReview } from "@/lib/weekly";
import {
  FOCUS_MAX,
  WEEKDAYS,
  addDays,
  daysInMonth,
  monthOf,
  shortDate,
  weekdayIndex,
  type Entries,
  type Mood,
} from "@/lib/tracker";

const WEEKS = 10;
const MOOD_VAR: Record<Mood, string> = {
  good: "var(--color-good)",
  meh: "var(--color-meh)",
  bad: "var(--color-bad)",
};
const TILE_TONE_TEXT: Record<string, string> = { good: "text-good", meh: "text-meh", bad: "text-bad" };

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
      <Heatmap {...p} />
      <WeeklyReview entries={p.entries} today={p.today} spec={p.spec} />
      <Stats entries={p.entries} today={p.today} spec={p.spec} />
      <Reasons entries={p.entries} spec={p.spec} />
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
    <section className="tile tile-meh p-5">
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

/* ------------------------------ heatmap ------------------------------ */
// The old grid was a wash of similar-hued cells on a lilac tile — you couldn't see the
// filled days against the empty ones. Now the grid sits on its own white inner surface,
// cells are bigger, and the empty-day color is a light cream that actually contrasts.

function Heatmap({ entries, today, selected, spec, pulse, onPick }: Props) {
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
      if (n > 0) return "color-mix(in oklab, var(--color-ink) 22%, transparent)";
    } else if (n > 0) {
      return `color-mix(in oklab, var(--color-ink) ${25 + (n / total) * 75}%, transparent)`;
    }
    return "color-mix(in oklab, var(--color-ink) 6%, transparent)";
  }

  return (
    <section className="tile tile-lilac p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-ink/70">Weekly · awareness</p>
          <p className="mt-1 text-sm">
            This week: <b>{weekDone}</b>
            <span className="text-ink/75"> / {weekMax} things logged</span>
          </p>
        </div>
        <div className="flex rounded-full border border-ink/10 bg-white/70 p-0.5 text-xs font-medium">
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

      {/* white inner surface — the grid needs contrast against the card, not sameness with it */}
      <div className="mt-4 rounded-2xl bg-white/70 p-4">
        <div className="flex gap-3">
          <div className="flex shrink-0 flex-col gap-[5px] pt-[3px] text-[10px] leading-none text-ink/55">
            {WEEKDAYS.map((d, i) => (
              <span key={d} className="flex h-[17px] items-center">
                {i % 2 === 0 ? d : ""}
              </span>
            ))}
          </div>
          <div className="flex flex-1 justify-center gap-[5px]">
            {Array.from({ length: WEEKS }, (_, week) => (
              <div key={week} className="flex flex-col gap-[5px]">
                {Array.from({ length: 7 }, (_, day) => {
                  const i = week * 7 + day;
                  const d = days[i];
                  const popped = pulse.date === d;
                  const future = d > today;
                  const isSel = d === selected;
                  return (
                    <button
                      key={popped ? `${d}-${pulse.n}` : d}
                      type="button"
                      disabled={future}
                      onClick={() => onPick(d)}
                      aria-label={`${shortDate(d)}: ${dayProgress(entries[d], d, spec)} of ${total} logged`}
                      title={future ? "" : `${shortDate(d)} · ${dayProgress(entries[d], d, spec)}/${total} logged`}
                      style={{ background: bg(d), animationDelay: popped ? undefined : `${week * 16}ms` }}
                      className={`size-[17px] shrink-0 rounded-[5px] transition-transform ${future ? "invisible" : "hover:scale-110"} ${
                        popped ? "cell-in" : "rise"
                      } ${isSel ? "ring-2 ring-ink" : ""}`}
                    />
                  );
                })}
              </div>
            ))}
          </div>
        </div>

        <div className="mt-3 flex items-center justify-between text-[11px] text-ink/60">
          <span>Tap a day to open it.</span>
          <span className="flex items-center gap-1">
            {mode === "progress" ? "less" : "rough"}
            {(mode === "progress"
              ? [0.06, 0.3, 0.55, 0.8, 1].map((o) => `color-mix(in oklab, var(--color-ink) ${o * 100}%, transparent)`)
              : [MOOD_VAR.bad, MOOD_VAR.meh, MOOD_VAR.good]
            ).map((c) => (
              <i key={c} className="inline-block size-3 rounded-[3px]" style={{ background: c }} />
            ))}
            {mode === "progress" ? "more" : "good"}
          </span>
        </div>
      </div>
    </section>
  );
}

/* ------------------------------ this week's patterns ------------------------------ */

function WeeklyReview({ entries, today, spec }: { entries: Entries; today: string; spec: HabitSpec }) {
  const { insights, reasons } = weeklyReview(spec, entries, today);
  if (insights.length === 0 && reasons.length === 0) return null;

  return (
    <section className="tile tile-good p-5">
      <p className="text-xs font-medium uppercase tracking-wider text-ink/70">This week · patterns</p>
      <h2 className="mt-1 text-base font-semibold">What stood out</h2>

      {insights.length > 0 ? (
        <ul className="mt-3 space-y-2.5">
          {insights.map((i) => (
            <li key={i.key} className="flex gap-2.5 text-sm leading-snug">
              <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-ink/60" />
              <span>{i.text}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-sm text-ink/75">Nothing repeated enough this week to call a pattern — that's fine.</p>
      )}

      {reasons.length > 0 && (
        <div className="mt-4 border-t border-white/40 pt-3">
          <p className="mb-2 text-xs font-medium text-ink/70">Top reasons this week</p>
          <ul className="space-y-1.5">
            {reasons.map((r) => (
              <li key={r.id} className="flex items-center gap-2 text-xs">
                <span className="w-24 shrink-0">{r.label}</span>
                <span
                  className="h-2 rounded-full bg-white/70 transition-[width] duration-500"
                  style={{ width: `${(r.n / reasons[0].n) * 55}%`, minWidth: 10 }}
                />
                <span className="font-semibold tabular-nums">{r.n}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

/* ------------------------------ your numbers so far ------------------------------ */

function Stats({ entries, today, spec }: { entries: Entries; today: string; spec: HabitSpec }) {
  const tiles = statTiles(spec, entries, today);
  if (tiles.length === 0) return null;

  return (
    <section>
      <p className="px-1 text-xs font-medium uppercase tracking-wider text-ink/50">Your numbers so far</p>
      <p className="mb-2 px-1 text-xs text-ink/50">One per question, calculated from the last 30 days.</p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {tiles.map((t) => (
          <div key={t.key} className="card p-4">
            <p className="truncate text-[10px] font-semibold uppercase tracking-wider text-ink/45">{t.section}</p>
            <p className={`mt-0.5 text-xl font-semibold ${t.tone ? TILE_TONE_TEXT[t.tone] : ""}`}>{t.value}</p>
            <p className="mt-0.5 text-[13px] leading-snug text-ink/70">{t.context}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ------------------------------ reasons = truth (all-time) ------------------------------ */

function Reasons({ entries, spec }: { entries: Entries; spec: HabitSpec }) {
  const bad = Object.entries(entries).filter(([, e]) => e.mood === "bad");
  const counts = reasonTally(spec, entries);
  const max = counts[0]?.n ?? 1;
  const untagged = bad.filter(([, e]) => e.tags.length === 0).length;

  const perWeekday = WEEKDAYS.map((_, i) => bad.filter(([k]) => weekdayIndex(k) === i).length);
  const worst = Math.max(...perWeekday);
  const worstDay = worst >= 2 ? WEEKDAYS[perWeekday.indexOf(worst)] : null;

  if (counts.length === 0) return null;

  return (
    <section className="tile tile-lilac p-5">
      <p className="text-xs font-medium uppercase tracking-wider text-ink/70">All time</p>
      <h2 className="mt-1 text-base font-semibold">Why things go rough</h2>

      <ul className="mt-3 space-y-2.5">
        {counts.map((t) => (
          <li key={t.id} className="flex items-center gap-3 text-sm">
            <span className="w-28 shrink-0">{t.label}</span>
            <span
              className="h-2.5 rounded-full bg-white/70 transition-[width] duration-500"
              style={{ width: `${(t.n / max) * 55}%`, minWidth: 10 }}
            />
            <span className="font-semibold tabular-nums">{t.n}</span>
          </li>
        ))}
      </ul>

      {(worstDay || untagged > 0) && (
        <p className="mt-4 text-xs text-ink/75">
          {worstDay && <>Rough days cluster on {worstDay}s ({worst}). </>}
          {untagged > 0 && <>{untagged} rough {untagged === 1 ? "day has" : "days have"} no reason yet.</>}
        </p>
      )}
    </section>
  );
}
