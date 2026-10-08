"use client";

import { useRef, useState } from "react";
import { ChevronDown, Plus, X } from "lucide-react";
import type { HabitSpec } from "@/lib/spec";
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
import { FOCUS_MAX, REVIEW_NOTE_MAX, daysInMonth, monthName, type Entries } from "@/lib/tracker";
import { Fold } from "./fold";
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
  "on-pace": "bg-surface text-ink",
  behind: "bg-meh text-onpastel",
  "out-of-reach": "bg-bad text-onpastel",
  missed: "bg-bad text-onpastel",
  over: "bg-bad text-onpastel",
};

function GoalRow({ v, onRemove }: { v: GoalView; onRemove: () => void }) {
  return (
    <li className="rounded-2xl bg-surface/60 p-3">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold leading-tight">{v.title}</p>
          <p className="text-xs text-soft">{v.headline}</p>
        </div>
        <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${STATUS_CHIP[v.status]}`}>{STATUS_WORD[v.status]}</span>
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Remove goal: ${v.title}`}
          className="hit -mr-1 flex size-6 shrink-0 items-center justify-center rounded-full text-soft transition-colors hover:text-ink"
        >
          <X size={14} />
        </button>
      </div>
      {/* the bar is how much you've done; the tick is where the month says you should be */}
      <div className="relative mt-2.5 h-2 rounded-full bg-ink/10">
        <div className="h-full rounded-full bg-ink transition-[width] duration-500" style={{ width: `${Math.round(v.fraction * 100)}%` }} />
        {v.pace !== null && (
          <i className="absolute -top-0.75 h-3.5 w-0.5 rounded-full bg-ink/60" style={{ left: `${Math.round(v.pace * 100)}%` }} aria-hidden />
        )}
      </div>
      <p className="mt-1.5 text-xs text-ink/85">
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
        className="mt-3 flex items-center gap-1.5 rounded-full bg-surface/60 px-3.5 py-2 text-sm font-medium transition-colors hover:bg-surface/80"
      >
        <Plus size={15} /> Add a goal
      </button>
    );
  }

  return (
    <div className="mt-3 rounded-2xl bg-surface/60 p-3">
      {free.length > 0 && (
        <>
          <p className="mb-2 text-xs font-medium text-soft">From your setup, one tap</p>
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
          <button type="button" onClick={() => setOwn(true)} className="hit mt-3 block text-xs text-soft underline underline-offset-2 hover:text-ink">
            Set your own
          </button>
        )
      ) : (
        <div className="mt-3 flex flex-col gap-2 text-sm">
          <select
            value={what}
            onChange={(e) => setWhat(e.target.value)}
            className="w-full appearance-none rounded-xl border border-ink/15 bg-surface/80 px-3 py-2 outline-none focus:border-ink"
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
                  className="appearance-none rounded-xl border border-ink/15 bg-surface/80 px-3 py-2 outline-none focus:border-ink"
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
                className="w-32 rounded-xl border border-ink/15 bg-surface/80 px-3 py-2 outline-none focus:border-ink"
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

      <button type="button" onClick={close} className="mt-3 block text-xs text-soft hover:text-ink">
        Cancel
      </button>
    </div>
  );
}

/**
 * This month's direction. Closed it is one slim line (your focus words and how many goals are on track); tapping it
 * opens the editor in place: the focus line, the goals, and adding one. The mirror below is the page.
 */
export function MonthCard({
  month,
  focus,
  plan,
  lastMonth,
  lastPlan,
  onFocus,
  startOpen = false,
  ...c
}: Common & {
  month: string;
  focus: string;
  plan: MonthPlan;
  lastMonth: string;
  lastPlan: MonthPlan | undefined;
  onFocus: (month: string, text: string) => void;
  /** drawn open (the editor is built straight away); the page leaves it closed */
  startOpen?: boolean;
}) {
  const { entries, today, spec, onPlan } = c;
  const [text, setText] = useState(focus);
  const [open, setOpen] = useState(startOpen);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const dayOfMonth = Number(today.slice(8));

  const views = goalViews(spec, entries, month, today, plan.goals);
  // goals whose section or question has since been removed aren't shown, so don't let them
  // take up room or linger: any edit here writes only the ones still showing
  const live = new Set(views.map((v) => v.goal.id));
  const liveGoals = plan.goals.filter((g) => live.has(g.id));
  const taken = new Set(liveGoals.map(goalKey));
  const suggestions = suggestGoals(spec, entries, month, today);
  const canRepeat = liveGoals.length === 0 && (lastPlan?.goals.length ?? 0) > 0;
  const onTrack = views.filter((v) => v.status === "reached" || v.status === "on-pace").length;

  const save = (goals: typeof plan.goals) => onPlan(month, { ...plan, goals });

  return (
    <section className="tile tile-good">
      <button type="button" aria-expanded={open} onClick={() => setOpen((o) => !o)} className="flex w-full items-center gap-3 px-4 py-3 text-left">
        <span className="min-w-0 flex-1">
          <span className="block text-xs font-semibold uppercase tracking-wider text-soft">{monthName(month)} · direction</span>
          <span className={`block truncate text-base font-semibold leading-snug ${text.trim() ? "" : "text-soft"}`}>{text.trim() || "Where are you heading?"}</span>
        </span>
        {views.length > 0 && (
          <span className="shrink-0 rounded-full bg-surface/60 px-2.5 py-1 text-xs font-semibold">
            {onTrack} of {views.length} on track
          </span>
        )}
        <ChevronDown size={18} aria-hidden className={`shrink-0 text-soft transition-transform duration-200 ${open ? "rotate-180" : ""}`} />
      </button>

      <Fold open={open}>
        <div className="px-5 pb-5">
          <p className="text-xs text-soft">
            Day {dayOfMonth} of {daysInMonth(month)}
          </p>

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
            className="mt-2 w-full border-b border-ink/25 bg-transparent pb-2 text-lg font-medium outline-none transition-colors placeholder:text-soft focus:border-ink"
          />

          {views.length > 0 ? (
            <ul className="mt-4 flex flex-col gap-2">
              {views.map((v) => (
                <GoalRow key={v.goal.id} v={v} onRemove={() => save(liveGoals.filter((g) => g.id !== v.goal.id))} />
              ))}
            </ul>
          ) : (
            <p className="mt-4 text-sm text-ink/85">
              {monthName(month)} has started. What are you aiming at? Goals are measured from what you already log, so there&apos;s nothing to tick.
            </p>
          )}

          {canRepeat && (
            <button
              type="button"
              onClick={() => save(repeatGoals(lastPlan, { goals: liveGoals }))}
              className="mt-3 mr-2 rounded-full bg-surface/60 px-3.5 py-2 text-sm font-medium transition-colors hover:bg-surface/80"
            >
              Repeat {monthName(lastMonth)}&apos;s goals
            </button>
          )}

          {liveGoals.length < MAX_GOALS ? (
            <AddGoal spec={spec} suggestions={suggestions} taken={taken} onAdd={(g) => save([...liveGoals, { ...g, id: newGoalId(liveGoals) }])} />
          ) : (
            <p className="mt-3 text-xs text-soft">That&apos;s {MAX_GOALS} goals, enough to keep the month clear.</p>
          )}
        </div>
      </Fold>
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
  // answered already: it stays as one slim line (to add a note or change the answer), not as the whole card
  const [open, setOpen] = useState(!review);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const setReview = (outcome: "yes" | "partly" | "no" | null, text: string) =>
    onPlan(month, { goals: plan.goals, ...(outcome ? { review: { outcome, note: text } } : {}) });

  function answer(id: (typeof OUTCOMES)[number]["id"]) {
    const next = review?.outcome === id ? null : id;
    setReview(next, note);
    if (next) setOpen(false); // saved: the card closes itself
  }

  function done() {
    if (timer.current) clearTimeout(timer.current);
    if (review && note !== review.note) setReview(review.outcome, note);
    setOpen(false);
  }

  if (review && !open) {
    const word = OUTCOMES.find((o) => o.id === review.outcome)?.label ?? "";
    return (
      <section className="tile tile-lilac flex items-center gap-3 px-4 py-3">
        <p className="min-w-0 flex-1 text-sm leading-snug">
          <span className="font-semibold">{monthName(month)} reviewed:</span> {word}.
          {review.note.trim() && <span className="text-soft"> {review.note.length > 60 ? `${review.note.slice(0, 60)}…` : review.note}</span>}
        </p>
        <button type="button" onClick={() => setOpen(true)} className="hit shrink-0 text-sm font-medium underline underline-offset-2">
          {review.note.trim() ? "Edit" : "Add a note"}
        </button>
      </section>
    );
  }

  return (
    <section className="tile tile-lilac p-5">
      <p className="text-xs font-medium uppercase tracking-wider text-soft">{monthName(month)}, in review</p>

      {focus.trim() && <p className="mt-2 text-lg font-medium leading-snug">&ldquo;{focus.trim()}&rdquo;</p>}

      {views.length > 0 && (
        <ul className="mt-3 flex flex-col gap-1.5">
          {views.map((v) => (
            <li key={v.goal.id} className="flex items-center gap-2 rounded-xl bg-surface/60 px-3 py-2 text-sm">
              <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_CHIP[v.status]}`}>{STATUS_WORD[v.status]}</span>
              <span className="min-w-0 flex-1 truncate">
                <b className="font-semibold">{v.title}</b> <span className="text-soft">{v.headline}</span>
              </span>
              <span className="shrink-0 text-xs tabular-nums text-ink/85">{v.progress}</span>
            </li>
          ))}
        </ul>
      )}

      <p className="mt-4 text-sm font-semibold">{focus.trim() ? "Did you move toward it?" : "How did the month go?"}</p>
      <div className="mt-2 flex gap-2">
        {OUTCOMES.map((o) => (
          <Chip key={o.id} on={review?.outcome === o.id} onClick={() => answer(o.id)}>
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
          className="mt-3 w-full border-b border-ink/25 bg-transparent pb-2 text-sm outline-none transition-colors placeholder:text-soft focus:border-ink"
        />
      )}
      {review && (
        <div className="mt-3 flex justify-end">
          <button type="button" onClick={done} className="rounded-full bg-ink px-4 py-1.5 text-sm font-medium text-cream shadow-md shadow-shade/30 transition-transform active:scale-95">
            Done
          </button>
        </div>
      )}
    </section>
  );
}

/** Is there anything from `month` worth looking back at? */
export const worthReviewing = (plan: MonthPlan | undefined, focus: string) => planHasContent(plan, focus);
