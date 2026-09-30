"use client";

import { useState } from "react";
import { Minus, Plus } from "lucide-react";
import { fieldVisible, formatAmount, LIMITS, splitKey, whyKey, type AmountField, type Data, type FieldSpec } from "@/lib/spec";
import { Chip } from "./ui";
import { WhySelector } from "./why-selector";

type Value = string | number | string[] | undefined;
type Props = {
  field: FieldSpec;
  data: Data;
  /** this is the one question in its section that should ask "why did this slip?" */
  askWhy: boolean;
  /** this multi-choice breaks a number down ("On what?" after "Spent today"): picks can carry an amount */
  split?: AmountField;
  onChange: (key: string, value: Value) => void;
  onWhy: (key: string, tags: string[]) => void;
  onAddOption: (field: FieldSpec, label: string) => void;
};

export function FieldView({ field, data, askWhy, split, onChange, onWhy, onAddOption }: Props) {
  const open = fieldVisible(field, data);
  return (
    <div className="fold" data-open={open} inert={!open}>
      <div>
        <div className="pt-4">
          <p className="mb-2 text-xs font-medium text-ink/75">{field.label}</p>
          <Body field={field} data={data} split={split} onChange={onChange} onAddOption={onAddOption} />
          {/* whether it opens is decided once per section (whyPromptKey), so two slips don't ask twice */}
          {field.kind !== "multi" && (
            <WhySelector
              tags={(data[whyKey(field.key)] as string[] | undefined) ?? []}
              open={askWhy}
              onChange={(next) => onWhy(field.key, next)}
              small
            />
          )}
        </div>
      </div>
    </div>
  );
}

function Body({ field, data, split, onChange, onAddOption }: Pick<Props, "field" | "data" | "split" | "onChange" | "onAddOption">) {
  const v = data[field.key];

  if (field.kind === "single") {
    return (
      <div className="flex flex-wrap gap-2">
        {field.options.map((o) => (
          <Chip
            key={o.id}
            on={v === o.id}
            tone={o.tone}
            onClick={() => onChange(field.key, v === o.id ? undefined : o.id)}
          >
            {o.label}
          </Chip>
        ))}
        <AddOption field={field} onAdd={(label) => onAddOption(field, label)} />
      </div>
    );
  }

  if (field.kind === "multi") {
    const cur = (v as string[] | undefined) ?? [];
    return (
      <div>
        <div className="flex flex-wrap gap-2">
          {field.options.map((o) => {
            const on = cur.includes(o.id);
            return (
              <Chip
                key={o.id}
                on={on}
                onClick={() => {
                  const next = on ? cur.filter((x) => x !== o.id) : [...cur, o.id];
                  onChange(field.key, next.length ? next : undefined);
                }}
              >
                {o.label}
              </Chip>
            );
          })}
          <AddOption field={field} onAdd={(label) => onAddOption(field, label)} />
        </div>
        {split && <SplitRows field={field} parent={split} data={data} onChange={onChange} />}
      </div>
    );
  }

  if (field.kind === "counter") {
    const n = typeof v === "number" ? v : 0;
    const reached = n >= field.goal;
    return (
      <div>
        <div className="flex items-center gap-4">
          <RoundBtn label="Less" onClick={() => onChange(field.key, n > 0 ? n - 1 : undefined)} disabled={n === 0}>
            <Minus size={18} />
          </RoundBtn>
          <div className="min-w-24 text-center">
            <span key={n} className="bump inline-block text-4xl font-semibold tabular-nums">
              {n}
            </span>
            <span className="ml-1 text-sm text-ink/75">/ {field.goal} {field.unit}</span>
          </div>
          <RoundBtn label="More" onClick={() => onChange(field.key, Math.min(field.max, n + 1))} disabled={n >= field.max}>
            <Plus size={18} />
          </RoundBtn>
        </div>
        <div className="mt-3 flex gap-1">
          {Array.from({ length: field.max }, (_, i) => (
            <span
              key={i}
              className={`h-1.5 flex-1 rounded-full transition-colors duration-300 ${
                i < n ? (reached ? "bg-good" : "bg-ink") : "bg-ink/10"
              }`}
            />
          ))}
        </div>
      </div>
    );
  }

  return <Amount field={field} value={typeof v === "number" ? v : undefined} onChange={onChange} />;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Optional "how much on each?" for the picks you made: total 190, food 150, transport 40.
 * Shows only for picked options, never blocks anything, and says in plain words how much of the
 * total is still unassigned (or that the parts run past it) without correcting you.
 */
function SplitRows({
  field,
  parent,
  data,
  onChange,
}: {
  field: Extract<FieldSpec, { kind: "multi" }>;
  parent: AmountField;
  data: Data;
  onChange: Props["onChange"];
}) {
  const cur = (data[field.key] as string[] | undefined) ?? [];
  const picked = field.options.filter((o) => cur.includes(o.id));
  const total = typeof data[parent.key] === "number" ? (data[parent.key] as number) : 0;
  const part = (id: string) => {
    const v = data[splitKey(field.key, id)];
    return typeof v === "number" ? v : undefined;
  };
  const sum = round2(picked.reduce((a, o) => a + (part(o.id) ?? 0), 0));
  const show = (n: number) => formatAmount(parent, n);
  const line =
    sum === 0
      ? null
      : sum === total
        ? "Fully split."
        : sum < total
          ? `${show(round2(total - sum))} not split yet.`
          : `Adds up to ${show(sum)}, ${show(round2(sum - total))} over the total.`;

  return (
    <div className="fold" data-open={picked.length > 0} inert={picked.length === 0}>
      <div>
        <div className="pt-4">
          <p className="mb-2 text-xs font-medium text-ink/75">
            Split it up <span className="font-normal text-ink/60">(optional)</span>
          </p>
          <div className="space-y-1.5">
            {picked.map((o) => (
              <SplitInput
                key={o.id}
                label={o.label}
                parent={parent}
                value={part(o.id)}
                onCommit={(n) => onChange(splitKey(field.key, o.id), n)}
              />
            ))}
          </div>
          {line && <p className="mt-2 text-xs text-ink/70">{line}</p>}
        </div>
      </div>
    </div>
  );
}

function SplitInput({
  label,
  parent,
  value,
  onCommit,
}: {
  label: string;
  parent: AmountField;
  value: number | undefined;
  onCommit: (n: number | undefined) => void;
}) {
  const [text, setText] = useState(value === undefined ? "" : String(value));

  // saved when you leave the box (or press Enter), so typing 150 isn't saved as 1, then 15, then 150
  function commit() {
    const n = parseFloat(text);
    const next = Number.isFinite(n) && n > 0 ? round2(n) : undefined;
    setText(next === undefined ? "" : String(next));
    if (next !== value) onCommit(next);
  }

  return (
    <label className="flex items-center gap-3">
      <span className="min-w-0 flex-1 truncate text-sm">{label}</span>
      <span className="flex items-center gap-1 text-sm text-ink/70">
        {parent.prefix}
        <input
          value={text}
          inputMode="decimal"
          onChange={(e) => setText(e.target.value.replace(/[^\d.]/g, ""))}
          onBlur={commit}
          onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
          placeholder="optional"
          aria-label={`${label} amount`}
          className="chip w-24 rounded-full px-3 py-1.5 text-right text-sm text-ink outline-none placeholder:text-ink/45 focus:border-ink"
        />
        {parent.suffix}
      </span>
    </label>
  );
}

/** "Other" with no way to say what it was is a dead end — lets you add a real, permanent
 * option on the spot. It's saved to your Setup immediately, so it's there to tap next time too. */
function AddOption({
  field,
  onAdd,
}: {
  field: Extract<FieldSpec, { kind: "single" | "multi" }>;
  onAdd: (label: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  if (field.options.length >= LIMITS.options) return null;

  function submit() {
    const label = text.trim();
    setText("");
    setOpen(false);
    if (label) onAdd(label);
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="chip flex items-center gap-1 rounded-full px-3.5 py-2 text-sm text-ink/60"
      >
        <Plus size={14} /> Write your own
      </button>
    );
  }
  return (
    <input
      autoFocus
      value={text}
      maxLength={30}
      onChange={(e) => setText(e.target.value)}
      onKeyDown={(e) => e.key === "Enter" && submit()}
      onBlur={submit}
      placeholder="Type it, then Enter"
      className="chip w-36 rounded-full px-4 py-2 text-sm outline-none placeholder:text-ink/45 focus:border-ink"
    />
  );
}

function RoundBtn({
  children,
  onClick,
  disabled,
  label,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  label: string;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="chip flex size-11 items-center justify-center rounded-full disabled:opacity-30"
    >
      {children}
    </button>
  );
}

function Amount({
  field,
  value,
  onChange,
}: {
  field: Extract<FieldSpec, { kind: "amount" }>;
  value: number | undefined;
  onChange: Props["onChange"];
}) {
  const [text, setText] = useState("");

  function commit() {
    const n = parseFloat(text);
    if (Number.isFinite(n) && n >= 0) onChange(field.key, n);
    setText("");
  }

  const show = (n: number) => formatAmount(field, n);
  const round = (n: number) => Math.round(n * 100) / 100;
  const t = field.target;
  // plain words, no color: it has to read on any tile, and it's a fact, not a verdict
  const targetLine = !t
    ? null
    : `Target: ${t.op === "atMost" ? "up to" : "at least"} ${show(t.value)}` +
      (value === undefined
        ? ""
        : t.op === "atMost"
          ? value <= t.value
            ? " · within it"
            : ` · over by ${show(round(value - t.value))}`
          : value >= t.value
            ? " · met"
            : ` · ${show(round(t.value - value))} to go`);

  return (
    <div>
      <div className="flex items-baseline gap-2">
        <span key={value ?? "none"} className="bump inline-block text-4xl font-semibold tabular-nums">
          {value === undefined ? "—" : show(value)}
        </span>
        {value !== undefined && (
          <button
            type="button"
            onClick={() => onChange(field.key, undefined)}
            className="text-xs text-ink/65 underline underline-offset-2 hover:text-ink"
          >
            reset
          </button>
        )}
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <Chip on={value === 0} tone="good" onClick={() => onChange(field.key, value === 0 ? undefined : 0)}>
          Zero
        </Chip>
        {field.quick.map((q) => (
          <Chip key={q} on={false} onClick={() => onChange(field.key, (value ?? 0) + q)}>
            +{q}
          </Chip>
        ))}
        <input
          value={text}
          inputMode="decimal"
          onChange={(e) => setText(e.target.value.replace(/[^\d.]/g, ""))}
          onBlur={() => text && commit()}
          onKeyDown={(e) => e.key === "Enter" && commit()}
          placeholder={`Exact ${field.prefix}${field.suffix}`.trim() || "Exact"}
          aria-label="Exact amount"
          className="chip w-24 rounded-full px-4 py-2 text-sm outline-none placeholder:text-ink/55 focus:border-ink"
        />
      </div>
      {targetLine && <p className="mt-2 text-xs text-ink/70">{targetLine}</p>}
    </div>
  );
}
