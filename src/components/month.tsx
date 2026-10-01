"use client";

import { useRef, useState } from "react";
import { Plus, X } from "lucide-react";
import { dayDone, dayTotal, hasActivity, specAt, type HabitSpec } from "@/lib/spec";
import {
  DAY_TARGET,
  MAX_GOALS,
  STATUS_WORD,
  goalKey,
  goalViews,
  newGoalId,
  planHasContent,
  repeatGoals,
  suggestGoals,
  totalChoices,
  type GoalInput,
  type GoalStatus,
  type GoalView,
  type MonthPlan,
} from "@/lib/goals";
import { FOCUS_MAX, REVIEW_NOTE_MAX, daysInMonth, monthDates, monthName, type Entries } from "@/lib/tracker";
import { Chip } from "./ui";

// Monthly = direction. The focus line says where you're heading; goals are measured from what
// you already log (see lib/goals.ts), so there's nothing to tick; and when a month ends, the next
// one opens by asking how it went.

type Common = {
  entries: Entries;
  today: string;
  spec: HabitSpec;
  onPlan: (month: string, plan: MonthPlan) => void;
};

const STATUS_CHIP: Record<GoalStatus, string> = {
  reached: "bg-ink text-cream",
  "on-pace": "bg-white text-ink",
  behind: "bg-meh text-ink",
  "out-of-reach": "bg-bad text-[#2b2946]",
  missed: "bg-bad text-[#2b2946]",
  over: "bg-bad text-[#2b2946]",
};

function GoalRow({ v, onRemove }: { v: GoalView; onRemove: () => void }) {
  return (
    <li className="rounded-2xl bg-white/60 p-3">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold leading-tight">{v.title}</p>
          <p className="text-xs text-ink/70">{v.headline}</p>
        </div>
        <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold ${STATUS_CHIP[v.status]}`}>{STATUS_WORD[v.status]}</span>
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Remove goal: ${v.title}`}
          className="-mr-1 flex size-6 shrink-0 items-center justify-center rounded-full text-ink/50 transition-colors hover:text-ink"
        >
          <X size={14} />
        </button>
      </div>
      {/* the bar is how much you've done; the tick is where the month says you should be */}
      <div className="relative mt-2.5 h-2 rounded-full bg-ink/10">
        <div className="h-full rounded-full bg-ink transition-all duration-500" style={{ width: `${Math.round(v.fraction * 100)}%` }} />
        {v.pace !== null && (
          <i className="absolute -top-[3px] h-[14px] w-[2px] rounded-full bg-ink/60" style={{ left: `${Math.round(v.pace * 100)}%` }} aria-hidden />
        )}
      </div>
      <p className="mt-1.5 text-xs text-ink/80">
        <b className="font-semibold text-ink">{v.progress}</b> · {v.note}
      </p>
    </li>
  );
}

/** Pick a one-tap suggestion drawn from your setup, or set your own. */
function AddGoal({
  spec,
  suggestions,
  taken,
  onAdd,
}: {
  spec: HabitSpec;
  suggestions: { label: string; goal: GoalInput }[];
  taken: Set<string>;
  onAdd: (g: GoalInput) => void;
}) {
  const [open, setOpen] = useState(false);
  const [own, setOwn] = useState(false);
  const [what, setWhat] = useState("");
  const [op, setOp] = useState<"atMost" | "atLeast">("atMost");
  const [num, setNum] = useState("");

  const free = suggestions.filter((s) => !taken.has(goalKey(s.goal)));
  const sectionChoices = [
    ...spec.sections.map((s) => ({ value: `d:${s.id}`, label: `${s.title} (days)` })),
    { value: `d:${DAY_TARGET}`, label: "Good or Okay days" },
  ].filter((c) => !taken.has(`days:${c.value.slice(2)}`));
  const numberChoices = totalChoices(spec)
    .map((c) => ({ value: `t:${c.key}`, label: `${c.label} (total)` }))
    .filter((c) => !taken.has(`total:${c.value.slice(2)}`));
  const choices = [...sectionChoices, ...numberChoices];
  const isTotal = what.startsWith("t:");

  function close() {
    setOpen(false);
    setOwn(false);
    setWhat("");
    setNum("");
  }
  function addOwn() {
    const n = Number(num);
    if (!what || !Number.isFinite(n) || n <= 0) return;
    onAdd(isTotal ? { kind: "total", field: what.slice(2), op, value: n } : { kind: "days", target: what.slice(2), days: Math.min(31, Math.round(n)) });
    close();
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-3 flex items-center gap-1.5 rounded-full bg-white/60 px-3.5 py-2 text-sm font-medium transition-colors hover:bg-white/80"
      >
        <Plus size={15} /> Add a goal
      </button>
    );
  }

  return (
    <div className="mt-3 rounded-2xl bg-white/60 p-3">
      {free.length > 0 && (
        <>
          <p className="mb-2 text-xs font-medium text-ink/75">From your setup, one tap</p>
          <div className="flex flex-wrap gap-1.5">
            {free.map((s) => (
              <Chip
                key={goalKey(s.goal)}
                small
                on={false}
                onClick={() => {
                  onAdd(s.goal);
                  close();
                }}
              >
                {s.label}
              </Chip>
            ))}
          </div>
        </>
      )}

      {!own ? (
        choices.length > 0 && (
          <button type="button" onClick={() => setOwn(true)} className="mt-3 block text-xs text-ink/70 underline underline-offset-2 hover:text-ink">
            Set your own
          </button>
        )
      ) : (
        <div className="mt-3 flex flex-col gap-2 text-sm">
          <select
            value={what}
            onChange={(e) => setWhat(e.target.value)}
            className="w-full appearance-none rounded-xl border border-ink/15 bg-white/80 px-3 py-2 outline-none focus:border-ink"
          >
            <option value="">What do you want to aim at?</option>
            {choices.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
          {what && (
            <div className="flex items-center gap-2">
              {isTotal && (
                <select
                  value={op}
                  onChange={(e) => setOp(e.target.value === "atLeast" ? "atLeast" : "atMost")}
                  className="appearance-none rounded-xl border border-ink/15 bg-white/80 px-3 py-2 outline-none focus:border-ink"
                >
                  <option value="atMost">Within</option>
                  <option value="atLeast">At least</option>
                </select>
              )}
              <input
                value={num}
                inputMode="decimal"
                onChange={(e) => setNum(e.target.value.replace(/[^\d.]/g, ""))}
                onKeyDown={(e) => e.key === "Enter" && addOwn()}
                placeholder={isTotal ? "amount" : "how many days"}
                aria-label="Target"
                className="w-32 rounded-xl border border-ink/15 bg-white/80 px-3 py-2 outline-none focus:border-ink"
              />
              <button
                type="button"
                onClick={addOwn}
                disabled={!num}
                className="rounded-full bg-ink px-4 py-2 text-sm font-medium text-cream transition-opacity disabled:opacity-40"
              >
                Add
              </button>
            </div>
          )}
        </div>
      )}

      <button type="button" onClick={close} className="mt-3 block text-xs text-ink/60 hover:text-ink">
        Cancel
      </button>
    </div>
  );
}

const MILESTONES = [3, 7, 14, 30, 60, 100];

/** This month: where you're heading, the goals you set for it, and how far along they are. */
export function MonthCard({
  month,
  focus,
  plan,
  lastMonth,
  lastPlan,
  streak,
  onFocus,
  ...c
}: Common & {
  month: string;
  focus: string;
  plan: MonthPlan;
  lastMonth: string;
  lastPlan: MonthPlan | undefined;
  streak: number;
  onFocus: (month: string, text: string) => void;
}) {
  const { entries, today, spec, onPlan } = c;
  const [text, setText] = useState(focus);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const dayOfMonth = Number(today.slice(8));
  const keys = monthDates(month);
  const logged = keys.filter((k) => hasActivity(entries[k], spec)).length;
  const next = MILESTONES.find((m) => m > streak);

  const views = goalViews(spec, entries, month, today, plan.goals);
  // goals whose section or question has since been removed aren't shown, so don't let them
  // take up room or linger: any edit here writes only the ones still showing
  const live = new Set(views.map((v) => v.goal.id));
  const liveGoals = plan.goals.filter((g) => live.has(g.id));
  const taken = new Set(liveGoals.map(goalKey));
  const suggestions = suggestGoals(spec, entries, month, today);
  const canRepeat = liveGoals.length === 0 && (lastPlan?.goals.length ?? 0) > 0;

  const save = (goals: typeof plan.goals) => onPlan(month, { ...plan, goals });

  return (
    <section className="tile tile-good p-5">
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-xs font-medium uppercase tracking-wider text-ink/70">{monthName(month)} · direction</p>
        <p className="text-xs text-ink/70">
          Day {dayOfMonth} of {daysInMonth(month)}
        </p>
      </div>

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

      {views.length > 0 ? (
        <ul className="mt-4 flex flex-col gap-2">
          {views.map((v) => (
            <GoalRow key={v.goal.id} v={v} onRemove={() => save(liveGoals.filter((g) => g.id !== v.goal.id))} />
          ))}
        </ul>
      ) : (
        <p className="mt-4 text-sm text-ink/80">
          {monthName(month)} has started. What are you aiming at? Goals are measured from what you already log, so there&apos;s nothing to tick.
        </p>
      )}

      {canRepeat && (
        <button
          type="button"
          onClick={() => save(repeatGoals(lastPlan, { goals: liveGoals }))}
          className="mt-3 mr-2 rounded-full bg-white/60 px-3.5 py-2 text-sm font-medium transition-colors hover:bg-white/80"
        >
          Repeat {monthName(lastMonth)}&apos;s goals
        </button>
      )}

      {liveGoals.length < MAX_GOALS ? (
        <AddGoal spec={spec} suggestions={suggestions} taken={taken} onAdd={(g) => save([...liveGoals, { ...g, id: newGoalId(liveGoals) }])} />
      ) : (
        <p className="mt-3 text-xs text-ink/70">That&apos;s {MAX_GOALS} goals, enough to keep the month clear.</p>
      )}

      <div className="mt-5 flex items-center justify-between text-sm">
        <span>
          <b className="text-xl font-semibold tabular-nums">{logged}</b>
          <span className="text-ink/75"> / {dayOfMonth} days logged</span>
        </span>
        <span className="rounded-full bg-white/60 px-3 py-1 text-xs font-semibold">{streak > 0 ? `${streak}-day streak` : "No streak yet"}</span>
      </div>

      <div className="mt-3 flex h-2 gap-[2px]">
        {keys.map((k) => {
          const e = entries[k];
          const then = specAt(spec, k);
          const share = hasActivity(e, spec) ? dayDone(e, k, then) / dayTotal(then, k) : 0;
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

const OUTCOMES = [
  { id: "yes", label: "Yes" },
  { id: "partly", label: "Partly" },
  { id: "no", label: "No" },
] as const;

/**
 * The month that just ended, looked at honestly: each goal's verdict, your focus line, and one
 * question, "did you move toward it?", with room to say why. Reasons are the truth, so the
 * answer matters more than the score.
 */
export function MonthReview({
  month,
  focus,
  plan,
  ...c
}: Common & { month: string; focus: string; plan: MonthPlan }) {
  const { entries, today, spec, onPlan } = c;
  const views = goalViews(spec, entries, month, today, plan.goals);
  const review = plan.review;
  const [note, setNote] = useState(review?.note ?? "");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const setReview = (outcome: "yes" | "partly" | "no" | null, text: string) =>
    onPlan(month, { goals: plan.goals, ...(outcome ? { review: { outcome, note: text } } : {}) });

  return (
    <section className="tile tile-lilac p-5">
      <p className="text-xs font-medium uppercase tracking-wider text-ink/70">{monthName(month)}, in review</p>

      {focus.trim() && <p className="mt-2 text-lg font-medium leading-snug">&ldquo;{focus.trim()}&rdquo;</p>}

      {views.length > 0 && (
        <ul className="mt-3 flex flex-col gap-1.5">
          {views.map((v) => (
            <li key={v.goal.id} className="flex items-center gap-2 rounded-xl bg-white/60 px-3 py-2 text-sm">
              <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${STATUS_CHIP[v.status]}`}>{STATUS_WORD[v.status]}</span>
              <span className="min-w-0 flex-1 truncate">
                <b className="font-semibold">{v.title}</b> <span className="text-ink/70">{v.headline}</span>
              </span>
              <span className="shrink-0 text-xs tabular-nums text-ink/80">{v.progress}</span>
            </li>
          ))}
        </ul>
      )}

      <p className="mt-4 text-sm font-semibold">{focus.trim() ? "Did you move toward it?" : "How did the month go?"}</p>
      <div className="mt-2 flex gap-2">
        {OUTCOMES.map((o) => (
          <Chip key={o.id} on={review?.outcome === o.id} onClick={() => setReview(review?.outcome === o.id ? null : o.id, note)}>
            {o.label}
          </Chip>
        ))}
      </div>

      {review && (
        <input
          value={note}
          maxLength={REVIEW_NOTE_MAX}
          onChange={(e) => {
            const v = e.target.value;
            setNote(v);
            if (timer.current) clearTimeout(timer.current);
            timer.current = setTimeout(() => setReview(review.outcome, v), 1500);
          }}
          onBlur={() => {
            if (timer.current) clearTimeout(timer.current);
            if (note !== review.note) setReview(review.outcome, note);
          }}
          placeholder="What got in the way, or what worked? Just for you."
          className="mt-3 w-full border-b border-ink/25 bg-transparent pb-2 text-sm outline-none transition-colors placeholder:text-ink/55 focus:border-ink"
        />
      )}
    </section>
  );
}

/** Is there anything from `month` worth looking back at? */
export const worthReviewing = (plan: MonthPlan | undefined, focus: string) => planHasContent(plan, focus);
