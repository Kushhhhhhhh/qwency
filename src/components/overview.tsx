"use client";

import { useRef, useState } from "react";
import { dayDone, dayTotal, hasActivity, type HabitSpec } from "@/lib/spec";
import { buildMirror, type Cell, type CellState, type RowMirror } from "@/lib/mirror";
import { iconFor } from "@/lib/icons";
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

/**
 * Patterns is a mirror: Reality, Gap, Reason — first for everything together, then for each
 * section against its own schedule. The heatmap and monthly direction sit underneath as
 * context. All the arithmetic lives in lib/mirror.ts.
 */
export function Overview(p: Props) {
  const [windowDays, setWindowDays] = useState<7 | 30>(7);
  const mirror = buildMirror(p.spec, p.entries, p.today, windowDays);

  return (
    <div className="flex flex-col gap-4">
      <Hero mirror={mirror} windowDays={windowDays} onWindow={setWindowDays} />
      {mirror.totals.planned > 0 && <Legend />}
      {mirror.rows.map((r) => (
        <Row key={r.id} row={r} compact={windowDays > 7} onPick={p.onPick} />
      ))}
      <Heatmap {...p} />
      <MonthCard {...p} />
    </div>
  );
}

/* ------------------------------ the hero ------------------------------ */

function Hero({
  mirror,
  windowDays,
  onWindow,
}: {
  mirror: ReturnType<typeof buildMirror>;
  windowDays: 7 | 30;
  onWindow: (n: 7 | 30) => void;
}) {
  const { totals, reasons, startedOn } = mirror;
  const windowStart = mirror.rows[0]?.cells[0]?.date ?? "";
  const partial = startedOn !== null && startedOn > windowStart;

  return (
    <section className="tile tile-meh p-5">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-medium uppercase tracking-wider text-ink/70">The mirror</p>
        <div className="flex rounded-full border border-ink/10 bg-white/70 p-0.5 text-xs font-medium">
          {([7, 30] as const).map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => onWindow(n)}
              aria-pressed={windowDays === n}
              className={`rounded-full px-3 py-1 transition-colors ${
                windowDays === n ? "bg-ink text-cream" : "text-ink/75 hover:text-ink"
              }`}
            >
              {n} days
            </button>
          ))}
        </div>
      </div>

      {startedOn === null ? (
        <p className="mt-3 text-base font-semibold leading-snug">Nothing logged yet. Tap in today and the mirror starts here.</p>
      ) : totals.planned === 0 ? (
        <p className="mt-3 text-base font-semibold leading-snug">Nothing has come due in this window yet.</p>
      ) : (
        <>
          <p className="mt-3 text-lg font-semibold leading-snug">
            You planned {totals.planned}. You did {totals.done}.
            {totals.gaps > 0 ? ` That leaves ${totals.gaps} ${totals.gaps === 1 ? "gap" : "gaps"}.` : " No gaps."}
          </p>

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

          {reasons.length > 0 && (
            <div className="mt-4">
              <p className="mb-2 text-xs font-medium uppercase tracking-wider text-ink/70">What got in the way</p>
              <div className="flex flex-wrap gap-1.5">
                {reasons.slice(0, 6).map((r) => (
                  <span key={r.label} className="rounded-full bg-white/70 px-3 py-1 text-sm font-medium">
                    {r.label} <span className="text-ink/60">×{r.n}</span>
                  </span>
                ))}
              </div>
            </div>
          )}

          {totals.unexplained > 0 && (
            <p className="mt-4 text-sm text-ink/75">
              {totals.unexplained} {totals.unexplained === 1 ? "gap has" : "gaps have"} no reason yet. Tap a square below to add one — no judgment.
            </p>
          )}

          {partial && startedOn && (
            <p className="mt-3 text-xs text-ink/65">Counting from {shortDate(startedOn)}, your first day.</p>
          )}
        </>
      )}
    </section>
  );
}

function Stat({ kicker, value, caption }: { kicker: string; value: string; caption: string }) {
  return (
    <div className="rounded-2xl bg-white/60 px-3 py-3">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-ink/60">{kicker}</p>
      <p className="mt-0.5 text-2xl font-semibold tabular-nums leading-none">{value}</p>
      <p className="mt-1 text-[11px] leading-tight text-ink/65">{caption}</p>
    </div>
  );
}

/* ------------------------------ the squares ------------------------------ */

const CELL: Record<CellState, string> = {
  done: "bg-ink text-cream",
  slipped: "bg-bad text-[#2b2946]",
  blank: "border border-dashed border-ink/40 bg-white/50 text-ink/50",
  open: "border border-ink/25 bg-white text-ink/50",
  off: "bg-ink/5 text-ink/25",
  extra: "bg-ink/40 text-cream",
};
const CELL_WORD: Record<CellState, string> = {
  done: "done",
  slipped: "slipped",
  blank: "not logged",
  open: "still open today",
  off: "not planned",
  extra: "done, though not planned",
};

function Legend() {
  const items: [CellState, string][] = [
    ["done", "Done"],
    ["slipped", "Slipped"],
    ["blank", "Not logged"],
    ["off", "Not planned"],
  ];
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-1 text-[11px] text-ink/60">
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
    <div className="flex gap-[3px]">
      {cells.map((c) => (
        <button
          key={c.date}
          type="button"
          onClick={() => onPick(c.date)}
          aria-label={`${shortDate(c.date)}: ${CELL_WORD[c.state]}`}
          title={`${shortDate(c.date)} · ${CELL_WORD[c.state]}`}
          className={`min-w-0 flex-1 rounded-md text-[10px] font-medium transition-transform active:scale-90 ${
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

function Row({ row, compact, onPick }: { row: RowMirror; compact: boolean; onPick: (d: string) => void }) {
  const Icon = iconFor(row.icon);
  const gapWords = [row.slipped ? `${row.slipped} slipped` : "", row.blank ? `${row.blank} not logged` : ""].filter(Boolean).join(", ");

  return (
    <section className="card p-4">
      <header className="flex items-center gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-2xl bg-lilac/50">
          <Icon size={18} strokeWidth={1.8} />
        </span>
        <h2 className="min-w-0 flex-1 truncate text-base font-semibold">{row.title}</h2>
        <span className="shrink-0 rounded-full bg-ink/5 px-2.5 py-1 text-[11px] font-medium text-ink/65">{row.schedule}</span>
      </header>

      <div className="mt-3">
        <Squares cells={row.cells} compact={compact} onPick={onPick} />
      </div>

      {row.planned === 0 ? (
        <p className="mt-3 text-sm text-ink/60">Nothing planned in this window yet.</p>
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
              {row.unexplained > 0 && <span className="text-ink/60">{row.unexplained} unexplained</span>}
              {row.reasons.length === 0 && row.unexplained === 0 && "Noted in your words."}
            </Line>
          )}
        </dl>
      )}

      {row.notes.length > 0 && (
        <ul className="mt-3 space-y-1.5 border-t border-ink/10 pt-3">
          {row.notes.map((n) => (
            <li key={n.date} className="text-[13px] leading-snug text-ink/80">
              “{n.text.length > 140 ? `${n.text.slice(0, 140)}…` : n.text}”{" "}
              <span className="text-ink/50">— {shortDate(n.date)}</span>
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
      <dt className="w-16 shrink-0 text-[11px] font-semibold uppercase tracking-wider text-ink/50 pt-[3px]">{label}</dt>
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

  function bg(d: string) {
    const e = entries[d];
    if (mode === "mood") {
      if (e?.mood) return MOOD_VAR[e.mood];
      if (hasActivity(e, spec)) return "color-mix(in oklab, var(--color-ink) 22%, transparent)";
    } else if (hasActivity(e, spec)) {
      // measured against what was planned that day, so a light weekend isn't a poor one
      const share = dayDone(e, d, spec) / dayTotal(spec, d);
      return `color-mix(in oklab, var(--color-ink) ${25 + share * 75}%, transparent)`;
    }
    return "color-mix(in oklab, var(--color-ink) 6%, transparent)";
  }

  return (
    <section className="tile tile-lilac p-5">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-medium uppercase tracking-wider text-ink/70">Your last {WEEKS} weeks</p>
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
                  const d = days[week * 7 + day];
                  const popped = pulse.date === d;
                  const future = d > today;
                  return (
                    <button
                      key={popped ? `${d}-${pulse.n}` : d}
                      type="button"
                      disabled={future}
                      onClick={() => onPick(d)}
                      aria-label={`${shortDate(d)}: ${dayDone(entries[d], d, spec)} of ${dayTotal(spec, d)} planned done`}
                      title={future ? "" : `${shortDate(d)} · ${dayDone(entries[d], d, spec)}/${dayTotal(spec, d)} planned done`}
                      style={{ background: bg(d), animationDelay: popped ? undefined : `${week * 16}ms` }}
                      className={`size-[17px] shrink-0 rounded-[5px] transition-transform ${future ? "invisible" : "hover:scale-110"} ${
                        popped ? "cell-in" : "rise"
                      } ${d === selected ? "ring-2 ring-ink" : ""}`}
                    />
                  );
                })}
              </div>
            ))}
          </div>
        </div>
        <p className="mt-3 text-[11px] text-ink/60">Darker = more of what you planned that day. Tap a day to open it.</p>
      </div>
    </section>
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

  const keys = Array.from({ length: daysInThisMonth }, (_, i) => `${month}-${String(i + 1).padStart(2, "0")}`);
  const logged = keys.filter((k) => hasActivity(entries[k], spec)).length;
  const next = MILESTONES.find((m) => m > streak);

  return (
    <section className="tile tile-good p-5">
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
          const e = entries[k];
          const share = hasActivity(e, spec) ? dayDone(e, k, spec) / dayTotal(spec, k) : 0;
          return (
            <i
              key={k}
              className="h-full flex-1 rounded-full transition-colors duration-300"
              style={{
                background: hasActivity(e, spec)
                  ? `color-mix(in oklab, var(--color-ink) ${25 + share * 75}%, transparent)`
                  : k > today
                    ? "transparent"
                    : "color-mix(in oklab, var(--color-ink) 10%, transparent)",
              }}
            />
          );
        })}
      </div>
      {streak > 0 && next && <p className="mt-3 text-xs text-ink/70">{next - streak} more days to a {next}-day streak.</p>}
    </section>
  );
}
