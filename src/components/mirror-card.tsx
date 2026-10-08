"use client";

import { AWAY_REASONS, awayLabel, type HabitSpec } from "@/lib/spec";
import type { Cell, CellState, Mirror, RowMirror } from "@/lib/mirror";
import type { Trend } from "@/lib/insights";
import { iconFor } from "@/lib/icons";
import { WEEKDAYS, shortDate, weekdayIndex, type Entries, type Mood } from "@/lib/tracker";
import { Fold } from "./fold";

// The top of Patterns, in plain words: what you did out of what you planned, which sections were missed (named), and
// then one grid for the whole window (a row per section, a square per day) that opens a section for the detail. The
// words are the same everywhere: Done, Missed (it landed on the wrong side of the line you drew), Not logged, Why.

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
  slipped: "missed",
  blank: "not logged",
  open: "still open today",
  off: "not planned",
  extra: "done, though not planned",
  away: "away",
};
const MOOD_CELL: Record<Mood, string> = { good: "bg-good", meh: "bg-meh", bad: "bg-bad" };
const MOOD_WORD: Record<Mood, string> = { good: "a good day", meh: "an okay day", bad: "a rough day" };

const DAY = "__day";
const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

/** "2 sick, 1 travelling": the away days in a window, by why. */
function awayWords(days: { reason: (typeof AWAY_REASONS)[number]["id"] }[]) {
  return AWAY_REASONS.map((r) => ({ r, n: days.filter((d) => d.reason === r.id).length }))
    .filter((x) => x.n > 0)
    .map((x) => `${x.n} ${awayLabel(x.r.id).toLowerCase()}`)
    .join(", ");
}

/** "2 missed, 1 not logged" */
const missWords = (r: Pick<RowMirror, "slipped" | "blank">) =>
  [r.slipped ? `${r.slipped} missed` : "", r.blank ? `${r.blank} not logged` : ""].filter(Boolean).join(", ");

export type ViewOption = { id: string; label: string };

/* ------------------------------ the answer ------------------------------ */

export function MirrorCard({
  mirror,
  value,
  options,
  onChange,
  trend,
  shape,
  run,
  onJump,
}: {
  mirror: Mirror;
  value: string;
  options: ViewOption[];
  onChange: (id: string) => void;
  trend: Trend | null;
  shape: { day: string; gaps: number; planned: number } | null;
  /** days in a row with nothing missed */
  run: { days: number };
  /** open this section's detail below */
  onJump: (rowId: string) => void;
}) {
  const { totals, reasons, startedOn, rows } = mirror;
  const windowStart = rows[0]?.cells[0]?.date ?? "";
  const partial = startedOn !== null && startedOn > windowStart;
  const missed = rows.filter((r) => r.gaps > 0);
  const pill = run.days > 0 ? `${run.days} ${plural(run.days, "day", "days")} with nothing missed` : null;

  return (
    <section className="tile tile-meh p-5">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <p className="text-xs font-medium uppercase tracking-wider text-soft">The mirror</p>
        <div className="flex rounded-full border border-ink/10 bg-surface/70 p-0.5 text-xs font-medium whitespace-nowrap">
          {options.map((o) => (
            <button
              key={o.id}
              type="button"
              onClick={() => onChange(o.id)}
              aria-pressed={value === o.id}
              className={`hit-y rounded-full px-2.5 py-1 transition-colors ${value === o.id ? "bg-ink text-cream" : "text-soft hover:text-ink"}`}
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
            You did {totals.done} of {totals.planned} planned {plural(totals.planned, "thing", "things")}.
          </p>

          <div className="mt-3 rounded-2xl bg-surface/60 p-3">
            <div
              role="img"
              aria-label={`${totals.done} done, ${totals.slipped} missed, ${totals.blank} not logged`}
              className="flex h-2.5 gap-0.5 overflow-hidden rounded-full"
            >
              {totals.done > 0 && <i className="rounded-full bg-ink" style={{ flexGrow: totals.done, flexBasis: 0 }} />}
              {totals.slipped > 0 && <i className="rounded-full bg-bad" style={{ flexGrow: totals.slipped, flexBasis: 0 }} />}
              {totals.blank > 0 && <i className="rounded-full bg-ink/25" style={{ flexGrow: totals.blank, flexBasis: 0 }} />}
            </div>
            <p className="mt-2 text-sm text-ink/90">
              <b className="font-semibold">{totals.done}</b> done
              {totals.slipped > 0 && (
                <>
                  {" · "}
                  <b className="font-semibold">{totals.slipped}</b> missed
                </>
              )}
              {totals.blank > 0 && (
                <>
                  {" · "}
                  <b className="font-semibold">{totals.blank}</b> not logged
                </>
              )}
            </p>
          </div>

          {(trend || shape || pill) && (
            <div className="mt-3 space-y-1 text-sm text-ink/85">
              {trend && <p>{trend.text}</p>}
              {shape && (
                <p>
                  {shape.day} are where most get missed: {shape.gaps} of {shape.planned}.
                </p>
              )}
              {pill && <span className="mt-1 inline-block rounded-full bg-surface/60 px-3 py-1 text-xs font-semibold">{pill}</span>}
            </div>
          )}

          {missed.length > 0 && (
            <div className="mt-4">
              <p className="mb-2 text-xs font-medium uppercase tracking-wider text-soft">What was missed</p>
              <div className="flex flex-wrap gap-1.5">
                {missed.map((r) => {
                  const Icon = iconFor(r.icon);
                  return (
                    <button
                      key={r.id}
                      type="button"
                      onClick={() => onJump(r.id)}
                      aria-label={`${r.id === DAY ? "Day overall" : r.title}: ${missWords(r)}`}
                      title={missWords(r)}
                      className="flex min-h-10 items-center gap-1.5 rounded-full bg-surface/70 px-3 py-1.5 text-sm font-medium transition-colors hover:bg-surface"
                    >
                      <Icon size={14} strokeWidth={2} aria-hidden />
                      {r.id === DAY ? "Day overall" : r.title}
                      <span className="font-semibold tabular-nums">{r.gaps}</span>
                    </button>
                  );
                })}
              </div>
            </div>
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
              {totals.unexplained} {plural(totals.unexplained, "has", "have")} no reason yet. Tap a square below to add one.
            </p>
          )}

          {mirror.away.length > 0 && (
            <p className="mt-3 text-sm text-ink/85">
              Away: {mirror.away.length} {plural(mirror.away.length, "day", "days")} ({awayWords(mirror.away)}). Not counted.
            </p>
          )}
          {partial && startedOn && <p className="mt-3 text-xs text-soft">Counting from {shortDate(startedOn)}, your first day.</p>}
        </>
      )}
    </section>
  );
}

/* ------------------------------ the grid ------------------------------ */

export function DayGrid({
  mirror,
  spec,
  entries,
  openRow,
  onToggle,
  onPick,
  onSetup,
}: {
  mirror: Mirror;
  spec: HabitSpec;
  entries: Entries;
  openRow: string | null;
  onToggle: (rowId: string) => void;
  onPick: (date: string) => void;
  onSetup: (sectionId: string) => void;
}) {
  if (mirror.startedOn === null || mirror.rows.length === 0) return null;
  // your own order (the sections as you set them up, the day overall last), so a row is always in the same place
  const byId = new Map(mirror.rows.map((r) => [r.id, r]));
  const rows = [...spec.sections.map((s) => byId.get(s.id)), byId.get(DAY)].filter((r): r is RowMirror => r !== undefined);
  const dates = rows[0].cells.map((c) => c.date);
  const n = dates.length;
  const wide = n <= 14; // the name beside the squares; longer windows keep the icon only (the detail still names it)
  const height = n <= 7 ? "h-7" : n <= 14 ? "h-5" : "h-4";
  const gap = n <= 14 ? "gap-0.75" : "gap-px";
  const showMoodKey = rows.some((r) => r.id === DAY && r.cells.some((c) => entries[c.date]?.mood));

  const legend: [string, string][] = [
    [CELL.done, "Done"],
    [CELL.slipped, "Missed"],
    [CELL.blank, "Not logged"],
    [CELL.off, "Not planned"],
    ...(mirror.away.length > 0 ? ([[CELL.away, "Away"]] as [string, string][]) : []),
  ];

  return (
    <section className="card p-4" aria-label="Day by day">
      <p className="text-xs font-medium uppercase tracking-wider text-soft">Day by day</p>
      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-soft">
        {legend.map(([cls, label]) => (
          <span key={label} className="flex items-center gap-1.5">
            <i className={`inline-block size-3 rounded-[3px] ${cls}`} />
            {label}
          </span>
        ))}
      </div>
      {showMoodKey && (
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-soft">
          <span>The day overall:</span>
          {(["good", "meh", "bad"] as const).map((m) => (
            <span key={m} className="flex items-center gap-1.5">
              <i className={`inline-block size-3 rounded-full ${MOOD_CELL[m]}`} />
              {m === "good" ? "Good" : m === "meh" ? "Okay" : "Rough"}
            </span>
          ))}
        </div>
      )}

      {wide && (
        <div className="mt-3 flex items-center gap-2" aria-hidden>
          <span className="w-28 shrink-0" />
          <div className={`flex flex-1 ${gap}`}>
            {dates.map((d) => (
              <span key={d} className="min-w-0 flex-1 text-center text-xs font-medium text-soft">
                {WEEKDAYS[weekdayIndex(d)][0]}
              </span>
            ))}
          </div>
        </div>
      )}

      <div className={`${wide ? "mt-1" : "mt-3"} flex flex-col gap-1.5`}>
        {rows.map((r) => {
          const Icon = iconFor(r.icon);
          const isOpen = openRow === r.id;
          const name = r.id === DAY ? "Day overall" : r.title;
          return (
            <div key={r.id} id={`mirror-row-${r.id}`}>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  aria-expanded={isOpen}
                  aria-label={`${name}${isOpen ? ", hide details" : ", show details"}`}
                  onClick={() => onToggle(r.id)}
                  className={`hit-y flex shrink-0 items-center gap-1.5 rounded-lg py-1 text-left transition-colors hover:text-ink ${wide ? "w-28" : "w-7 justify-center"} ${isOpen ? "text-ink" : "text-ink/85"}`}
                >
                  <Icon size={16} strokeWidth={1.9} className="shrink-0" aria-hidden />
                  {wide && <span className="min-w-0 truncate text-sm font-medium">{name}</span>}
                </button>
                <div className={`flex flex-1 ${gap}`}>
                  {r.cells.map((c) => (
                    <Square key={c.date} row={r} cell={c} mood={r.id === DAY ? (entries[c.date]?.mood ?? null) : null} height={height} onPick={onPick} />
                  ))}
                </div>
              </div>
              <Fold open={isOpen}>
                <Details row={r} onSetup={onSetup} />
              </Fold>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function Square({ row, cell, mood, height, onPick }: { row: RowMirror; cell: Cell; mood: Mood | null; height: string; onPick: (d: string) => void }) {
  // the day overall shows how the day felt, not only whether it was a miss
  const byMood = row.id === DAY && mood !== null && (cell.state === "done" || cell.state === "slipped");
  const word = byMood ? MOOD_WORD[mood] : CELL_WORD[cell.state];
  return (
    <button
      type="button"
      onClick={() => onPick(cell.date)}
      aria-label={`${row.id === DAY ? "Day overall" : row.title}, ${shortDate(cell.date)}: ${word}`}
      title={`${shortDate(cell.date)} · ${word}`}
      className={`min-w-0 flex-1 rounded-md transition-transform active:scale-90 ${height} ${byMood ? (mood === "bad" ? "bg-bad" : MOOD_CELL[mood]) : CELL[cell.state]}`}
    />
  );
}

/* ------------------------------ one section, opened ------------------------------ */

function Details({ row, onSetup }: { row: RowMirror; onSetup: (sectionId: string) => void }) {
  return (
    <div className="mb-1 mt-2 rounded-2xl bg-ink/5 px-3.5 py-3 text-sm">
      {row.planned === 0 ? (
        <p className="text-soft">Nothing planned in this window yet.</p>
      ) : (
        <dl className="space-y-1.5">
          <Line label="Done">
            {row.done} of {row.planned} planned {plural(row.planned, "day", "days")}
          </Line>
          {row.slipped > 0 && <Line label="Missed">{row.slipped}</Line>}
          {row.blank > 0 && <Line label="Not logged">{row.blank}</Line>}
          {row.gaps > 0 && (
            <Line label="Why">
              {row.reasons.length > 0 && row.reasons.map((r) => `${r.label} ×${r.n}`).join(" · ")}
              {row.reasons.length > 0 && row.unexplained > 0 && " · "}
              {row.unexplained > 0 && <span className="text-soft">{row.unexplained} with no reason yet</span>}
              {row.reasons.length === 0 && row.unexplained === 0 && "Noted in your words."}
            </Line>
          )}
        </dl>
      )}

      {/* the line this row is measured against, so a "miss" is never a mystery */}
      <p className="mt-2 text-xs text-soft">
        {row.rules.length > 0 ? (
          <>Missed if: {row.rules.join(" · ")}</>
        ) : (
          <>
            Nothing here can be missed yet, so only days not logged count.{" "}
            <button type="button" onClick={() => onSetup(row.id)} className="hit font-medium text-ink underline underline-offset-2">
              Set a target
            </button>
          </>
        )}
      </p>
      {row.rulesChangedOn && <p className="mt-1 text-xs text-soft">Rules changed {shortDate(row.rulesChangedOn)}. Earlier days keep the old ones.</p>}

      {row.where.length > 0 && (
        <p className="mt-3">
          <span className="text-xs font-semibold uppercase tracking-wider text-soft">Where it went</span>
          <br />
          {row.where.map((w) => `${w.label} ${w.amount}`).join(" · ")}
        </p>
      )}

      {row.notes.length > 0 && (
        <ul className="mt-3 space-y-1.5 border-t border-ink/10 pt-3">
          {row.notes.map((n) => (
            <li key={n.date} className="text-[13px] leading-snug text-ink/85">
              “{n.text.length > 140 ? `${n.text.slice(0, 140)}…` : n.text}” <span className="text-soft">— {shortDate(n.date)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Line({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3">
      <dt className="w-[5.5rem] shrink-0 pt-0.75 text-xs font-semibold uppercase tracking-wider text-soft">{label}</dt>
      <dd className="min-w-0 flex-1 text-ink/90">{children}</dd>
    </div>
  );
}
