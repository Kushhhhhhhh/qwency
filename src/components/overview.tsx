"use client";

import { useRef, useState } from "react";
import { completion, dayProgress, TOTAL_SECTIONS } from "@/lib/habits";
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
  pulse: { date: string; n: number };
  onPick: (date: string) => void;
  onFocus: (month: string, text: string) => void;
};

export function Overview(p: Props) {
  return (
    <div className="flex flex-col gap-4">
      <MonthCard {...p} />
      <Contributions {...p} />
      <Stats entries={p.entries} today={p.today} />
      <Reasons entries={p.entries} />
    </div>
  );
}

/* ------------------------------ monthly = direction ------------------------------ */

const MILESTONES = [3, 7, 14, 30, 60, 100];

function MonthCard({ entries, today, focus, streak, onFocus }: Props) {
  const month = monthOf(today);
  const total = daysInMonth(month);
  const dayOfMonth = Number(today.slice(8));
  const [text, setText] = useState(focus);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const keys = Array.from({ length: total }, (_, i) => `${month}-${String(i + 1).padStart(2, "0")}`);
  const logged = keys.filter((k) => completion(entries[k]) > 0).length;
  const next = MILESTONES.find((m) => m > streak);

  return (
    <section className="card p-5">
      <p className="text-xs font-medium uppercase tracking-wider text-ink/50">This month · direction</p>
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
        className="mt-2 w-full border-b border-ink/15 bg-transparent pb-2 text-lg font-medium outline-none transition-colors placeholder:text-ink/35 focus:border-ink"
      />

      <div className="mt-4 flex items-center justify-between text-sm">
        <span>
          <b className="text-xl font-semibold tabular-nums">{logged}</b>
          <span className="text-ink/60"> / {dayOfMonth} days logged</span>
        </span>
        <span className="rounded-full bg-lilac/60 px-3 py-1 text-xs font-semibold">
          {streak > 0 ? `${streak}-day streak` : "No streak yet"}
        </span>
      </div>

      <div className="mt-3 flex h-2 gap-[2px]">
        {keys.map((k) => {
          const n = dayProgress(entries[k], k);
          return (
            <i
              key={k}
              className="h-full flex-1 rounded-full transition-colors duration-300"
              style={{
                background:
                  n > 0
                    ? `color-mix(in oklab, var(--color-ink) ${25 + (n / TOTAL_SECTIONS) * 75}%, transparent)`
                    : k > today
                      ? "transparent"
                      : "color-mix(in oklab, var(--color-ink) 10%, transparent)",
              }}
            />
          );
        })}
      </div>
      <p className="mt-3 text-xs text-ink/55">
        {streak > 0 && next ? `${next - streak} more days to a ${next}-day streak.` : "Log something today to start one."}
      </p>
    </section>
  );
}

/* ------------------------------ weekly = awareness ------------------------------ */

function Contributions({ entries, today, selected, pulse, onPick }: Props) {
  const [mode, setMode] = useState<"progress" | "mood">("progress");
  const thisMonday = addDays(today, -weekdayIndex(today));
  const start = addDays(thisMonday, -(WEEKS - 1) * 7);
  const days = Array.from({ length: WEEKS * 7 }, (_, i) => addDays(start, i));

  const week = days.slice(-7).filter((d) => d <= today);
  const weekDone = week.reduce((a, d) => a + dayProgress(entries[d], d), 0);
  const weekMax = week.length * TOTAL_SECTIONS;

  function bg(d: string) {
    const e = entries[d];
    const n = dayProgress(e, d);
    if (mode === "mood") {
      if (e?.mood) return MOOD_VAR[e.mood];
      if (n > 0) return "color-mix(in oklab, var(--color-ink) 18%, transparent)";
    } else if (n > 0) {
      return `color-mix(in oklab, var(--color-ink) ${20 + (n / TOTAL_SECTIONS) * 80}%, transparent)`;
    }
    return "color-mix(in oklab, var(--color-ink) 7%, transparent)";
  }

  return (
    <section className="card p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-ink/50">Weekly · awareness</p>
          <p className="mt-1 text-sm">
            This week: <b>{weekDone}</b>
            <span className="text-ink/60"> / {weekMax} things logged</span>
          </p>
        </div>
        <div className="flex rounded-full border border-ink/10 bg-white/60 p-0.5 text-xs font-medium">
          {(["progress", "mood"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className={`rounded-full px-3 py-1 capitalize transition-colors ${
                mode === m ? "bg-ink text-cream" : "text-ink/60 hover:text-ink"
              }`}
            >
              {m}
            </button>
          ))}
        </div>
      </div>

      <div className="no-scrollbar mt-4 flex gap-2 overflow-x-auto pb-1">
        <div className="grid shrink-0 grid-rows-7 gap-[3px] text-[9px] leading-none text-ink/50">
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
                aria-label={`${shortDate(d)}: ${dayProgress(entries[d], d)} of ${TOTAL_SECTIONS} logged`}
                title={future ? "" : `${shortDate(d)} · ${dayProgress(entries[d], d)}/${TOTAL_SECTIONS} logged`}
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

      <div className="mt-3 flex items-center justify-between text-[11px] text-ink/55">
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

const SLEEP_HOURS: Record<string, number> = { lt5: 4.5, "5-6": 5.5, "6-7": 6.5, "7-8": 7.5, "8+": 8.5 };

function Stats({ entries, today }: { entries: Entries; today: string }) {
  const month = monthOf(today);
  const last30 = Array.from({ length: 30 }, (_, i) => entries[addDays(today, -i)]).filter(Boolean);
  const thisMonth = Object.entries(entries).filter(([k]) => monthOf(k) === month).map(([, e]) => e);

  const gymDays = last30.filter((e) => e.data.gym === "trained").length;
  const water = last30.map((e) => e.data.water).filter((v): v is number => typeof v === "number");
  const sleep = last30.map((e) => SLEEP_HOURS[e.data.sleep as string]).filter((v) => v !== undefined);
  const spent = thisMonth.reduce((a, e) => a + (typeof e.data.spend === "number" ? e.data.spend : 0), 0);
  const verdicts = last30.map((e) => e.data.spend_verdict).filter(Boolean);
  const reasonable = verdicts.filter((v) => v === "reasonable").length;
  const focusDays = last30.filter((e) => e.data.work_focus);
  const deep = focusDays.filter((e) => e.data.work_focus === "deep").length;

  const avg = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);
  const fmt = (n: number | null, digits = 1, suffix = "") => (n === null ? "—" : `${n.toFixed(digits)}${suffix}`);

  const tiles = [
    { label: "Gym sessions", sub: "last 30 days", value: String(gymDays) },
    { label: "Water", sub: "avg glasses / day", value: fmt(avg(water)) },
    { label: "Sleep", sub: "avg hours", value: fmt(avg(sleep)) },
    { label: "Spent", sub: "this month", value: `₹${spent.toLocaleString("en-IN")}` },
    {
      label: "Reasonable spend",
      sub: "of logged spends",
      value: verdicts.length ? `${Math.round((reasonable / verdicts.length) * 100)}%` : "—",
    },
    {
      label: "Deep focus",
      sub: "of work days",
      value: focusDays.length ? `${Math.round((deep / focusDays.length) * 100)}%` : "—",
    },
  ];

  return (
    <section>
      <p className="mb-2 px-1 text-xs font-medium uppercase tracking-wider text-ink/50">Your numbers so far</p>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {tiles.map((t) => (
          <div key={t.label} className="card px-4 py-3">
            <p className="text-2xl font-semibold tabular-nums">{t.value}</p>
            <p className="text-xs font-medium">{t.label}</p>
            <p className="text-[11px] text-ink/50">{t.sub}</p>
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
    <section className="card p-5">
      <p className="text-xs font-medium uppercase tracking-wider text-ink/50">Reasons · truth</p>
      <h2 className="mt-1 text-base font-semibold">Why days go rough</h2>

      {counts.length === 0 ? (
        <p className="mt-2 text-sm text-ink/60">
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
        <p className="mt-4 text-xs text-ink/60">
          {worstDay && <>Rough days cluster on {worstDay}s ({worst}). </>}
          {untagged > 0 && <>{untagged} rough {untagged === 1 ? "day has" : "days have"} no reason yet.</>}
        </p>
      )}
    </section>
  );
}
