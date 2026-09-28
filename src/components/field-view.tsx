"use client";

import { useState } from "react";
import { Minus, Plus } from "lucide-react";
import { fieldVisible, hasDedicatedFollowUp, LIMITS, toneOfValue, whyKey, type Data, type FieldSpec, type HabitSpec } from "@/lib/spec";
import { Chip } from "./ui";
import { WhySelector } from "./why-selector";

type Value = string | number | string[] | undefined;
type Props = {
  field: FieldSpec;
  data: Data;
  spec: HabitSpec;
  onChange: (key: string, value: Value) => void;
  onWhy: (key: string, tags: string[]) => void;
  onAddOption: (field: FieldSpec, label: string) => void;
};

export function FieldView({ field, data, spec, onChange, onWhy, onAddOption }: Props) {
  const open = fieldVisible(field, data);
  return (
    <div className="fold" data-open={open} inert={!open}>
      <div>
        <div className="pt-4">
          <p className="mb-2 text-xs font-medium text-ink/75">{field.label}</p>
          <Body field={field} data={data} spec={spec} onChange={onChange} onWhy={onWhy} onAddOption={onAddOption} />
        </div>
      </div>
    </div>
  );
}

function Body({ field, data, spec, onChange, onWhy, onAddOption }: Props) {
  const v = data[field.key];

  if (field.kind === "single") {
    // don't ask twice: if the spec already has a dedicated follow-up for this exact answer
    // (e.g. "What stopped you?" only when Gym = Skipped), the generic prompt stays out of the way
    const dedicated = typeof v === "string" && hasDedicatedFollowUp(spec, field.key, v);
    const bad = !dedicated && toneOfValue(field, v) === "bad";
    const tags = (data[whyKey(field.key)] as string[] | undefined) ?? [];
    return (
      <div>
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
        <WhySelector tags={tags} open={bad} onChange={(next) => onWhy(field.key, next)} small />
      </div>
    );
  }

  if (field.kind === "multi") {
    const cur = (v as string[] | undefined) ?? [];
    return (
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

  const show = (n: number) => `${field.prefix}${n.toLocaleString()}${field.suffix ? ` ${field.suffix}` : ""}`;

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
    </div>
  );
}
