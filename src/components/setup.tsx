"use client";

import { useState } from "react";
import { ChevronDown, Plus, RotateCcw, Trash2 } from "lucide-react";
import {
  DEFAULT_SPEC,
  breakdownOf,
  EVERY_DAY,
  LIMITS,
  WEEKDAYS_ONLY,
  WEEKENDS_ONLY,
  canSlip,
  scheduleLabel,
  schedulePreset,
  uniqueSlug,
  type FieldSpec,
  type HabitSpec,
  type OptionSpec,
  type SectionSpec,
  type Tone,
} from "@/lib/spec";
import { WEEKDAYS, localKey } from "@/lib/tracker";
import { ICON_IDS, iconFor } from "@/lib/icons";
import { canon } from "@/lib/sync";
import { Fold } from "./fold";
import { Chip } from "./ui";

type Save = "idle" | "saving" | "saved" | "error";
const inputBase =
  "rounded-xl border border-ink/15 bg-surface/70 px-3 py-2 text-sm outline-none transition-colors focus:border-ink";
const input = `w-full ${inputBase}`;
const select = `${input} appearance-none`;

const allKeys = (spec: HabitSpec) => new Set(spec.sections.flatMap((s) => s.fields.map((f) => f.key)));

export function Setup({
  spec,
  onSave,
  openId,
}: {
  spec: HabitSpec;
  onSave: (next: HabitSpec) => Promise<boolean>;
  /** a section to open straight away, e.g. when arriving from a Patterns row */
  openId?: string | null;
}) {
  const [draft, setDraft] = useState(spec);
  const [save, setSave] = useState<Save>("idle");
  // Collapsed by default — editing one section shouldn't mean scrolling past every other one.
  const [open, setOpen] = useState<Set<string>>(new Set(openId ? [openId] : []));
  // history (`past`) and removed options (`gone`) are kept by the server, not edited here, so they never count as an unsaved change
  const dirty = canon(draft, "past", "gone") !== canon(spec, "past", "gone");

  function toggle(id: string) {
    setOpen((o) => {
      const next = new Set(o);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  async function handleSave() {
    setSave("saving");
    const ok = await onSave(draft);
    setSave(ok ? "saved" : "error");
    if (ok) setTimeout(() => setSave("idle"), 1800);
  }

  function updateSection(i: number, patch: Partial<SectionSpec>) {
    setDraft((d) => ({ ...d, sections: d.sections.map((s, j) => (j === i ? { ...s, ...patch } : s)) }));
  }
  function moveSection(i: number, dir: -1 | 1) {
    setDraft((d) => {
      const arr = [...d.sections];
      const j = i + dir;
      if (j < 0 || j >= arr.length) return d;
      [arr[i], arr[j]] = [arr[j], arr[i]];
      return { ...d, sections: arr };
    });
  }
  function removeSection(i: number) {
    setDraft((d) => ({ ...d, sections: d.sections.filter((_, j) => j !== i) }));
  }
  function addSection() {
    const used = new Set(draft.sections.map((s) => s.id));
    const id = uniqueSlug("New section", used, "section");
    const key = uniqueSlug("answer", allKeys(draft), "answer");
    const field: FieldSpec = {
      kind: "single",
      key,
      label: "What happened?",
      options: [
        { id: "yes", label: "Yes" },
        { id: "no", label: "No" },
      ],
    };
    // `since` keeps the days before this section existed from ever counting as gaps
    const section: SectionSpec = {
      id,
      title: "New section",
      hint: "",
      icon: "circle",
      days: EVERY_DAY,
      since: localKey(new Date()),
      fields: [field],
    };
    setDraft((d) => ({ ...d, sections: [...d.sections, section] }));
    setOpen((o) => new Set(o).add(id));
  }

  return (
    <div className="flex flex-col gap-4 pb-24">
      <section className="card p-5">
        <p className="text-xs font-medium uppercase tracking-wider text-soft">Setup</p>
        <h2 className="mt-1 text-base font-semibold">What you track each day</h2>
        <p className="mt-1 text-sm text-soft">
          Change what your day tracks. Changing a rule counts from today on, so past days keep the
          rule they had; a rule you set for the first time covers days already logged. The overall
          verdict stays fixed for everyone so patterns stay comparable.
        </p>
        <div className="mt-4">
          <button
            type="button"
            onClick={() => setDraft(DEFAULT_SPEC)}
            className="flex items-center gap-1 text-sm text-soft hover:text-ink"
          >
            <RotateCcw size={14} /> Reset to default
          </button>
        </div>
      </section>

      {draft.sections.map((section, i) => (
        <SectionEditor
          key={section.id}
          section={section}
          index={i}
          total={draft.sections.length}
          spec={draft}
          isOpen={open.has(section.id)}
          onToggle={() => toggle(section.id)}
          onChange={(patch) => updateSection(i, patch)}
          onMove={(dir) => moveSection(i, dir)}
          onRemove={() => removeSection(i)}
        />
      ))}

      <button
        type="button"
        onClick={addSection}
        disabled={draft.sections.length >= LIMITS.sections}
        className="chip flex items-center justify-center gap-2 rounded-2xl py-4 text-sm font-medium disabled:opacity-40"
      >
        <Plus size={16} /> Add section
      </button>
      {draft.sections.length >= LIMITS.sections && (
        <p className="text-center text-xs text-soft">Max {LIMITS.sections} sections keeps the day quick to fill in.</p>
      )}

      {/* follows you down the page once there's something to save — no scrolling back up,
          and it just quietly disappears on a successful save instead of popping a toast */}
      {(dirty || save === "saving" || save === "error") && (
        <div className="toast-in fixed bottom-24 left-1/2 z-20 flex -translate-x-1/2 items-center gap-3 whitespace-nowrap rounded-full border border-ink/10 bg-surface/90 py-2 pl-4 pr-2 shadow-xl shadow-shade/20 backdrop-blur-md">
          <span className={`text-sm font-medium ${save === "error" ? "text-danger" : "text-soft"}`}>
            {save === "error" ? "Couldn't save, try again" : "Unsaved changes"}
          </span>
          {save !== "saving" && (
            <button type="button" onClick={() => setDraft(spec)} className="text-sm text-soft underline underline-offset-2 hover:text-ink">
              Discard
            </button>
          )}
          <button
            type="button"
            onClick={handleSave}
            disabled={save === "saving"}
            className="rounded-full bg-ink px-4 py-1.5 text-sm font-medium text-cream shadow-md shadow-shade/30 transition-opacity disabled:opacity-60"
          >
            {save === "saving" ? "Saving…" : "Save"}
          </button>
        </div>
      )}
    </div>
  );
}

function SectionEditor({
  section,
  index,
  total,
  spec,
  isOpen,
  onToggle,
  onChange,
  onMove,
  onRemove,
}: {
  section: SectionSpec;
  index: number;
  total: number;
  spec: HabitSpec;
  isOpen: boolean;
  onToggle: () => void;
  onChange: (patch: Partial<SectionSpec>) => void;
  onMove: (dir: -1 | 1) => void;
  onRemove: () => void;
}) {
  const Icon = iconFor(section.icon);

  function updateField(fi: number, patch: Partial<FieldSpec> | ((f: FieldSpec) => FieldSpec)) {
    onChange({
      fields: section.fields.map((f, j) => (j === fi ? (typeof patch === "function" ? patch(f) : { ...f, ...patch }) : f)) as FieldSpec[],
    });
  }
  function moveField(fi: number, dir: -1 | 1) {
    const arr = [...section.fields];
    const j = fi + dir;
    if (j < 0 || j >= arr.length) return;
    [arr[fi], arr[j]] = [arr[j], arr[fi]];
    onChange({ fields: arr });
  }
  function removeField(fi: number) {
    onChange({ fields: section.fields.filter((_, j) => j !== fi) });
  }
  function addField() {
    const key = uniqueSlug("detail", allKeys(spec), "detail");
    const field: FieldSpec = {
      kind: "single",
      key,
      label: "New question",
      options: [
        { id: "yes", label: "Yes" },
        { id: "no", label: "No" },
      ],
    };
    onChange({ fields: [...section.fields, field] });
  }

  return (
    <section className="card rise overflow-hidden" style={{ animationDelay: `${index * 40}ms` }}>
      <button type="button" onClick={onToggle} aria-expanded={isOpen} className="flex w-full items-center gap-3 p-5 text-left">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-lilac/60">
          <Icon size={20} strokeWidth={1.8} />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-base font-semibold leading-tight">{section.title || "Untitled"}</h2>
          <p className="truncate text-xs text-soft">
            {section.hint ? `${section.hint} · ` : ""}
            {section.fields.length} question{section.fields.length === 1 ? "" : "s"} · {scheduleLabel(section.days)}
            {!canSlip(section) && " · no target yet"}
          </p>
        </div>
        <ChevronDown size={18} className={`shrink-0 text-soft transition-transform duration-300 ${isOpen ? "rotate-180" : ""}`} />
      </button>

      {/* built the first time it opens: a closed section costs one empty box, not a whole editor */}
      <Fold open={isOpen}>
          <div className="px-5 pb-5">
            <div className="flex items-start gap-3 border-t border-ink/10 pt-4">
              <IconPicker value={section.icon} onChange={(icon) => onChange({ icon })} />
              <div className="min-w-0 flex-1 space-y-2">
                <input
                  value={section.title}
                  maxLength={40}
                  onChange={(e) => onChange({ title: e.target.value })}
                  placeholder="Section title"
                  className={`${input} font-semibold`}
                />
                <input
                  value={section.hint}
                  maxLength={60}
                  onChange={(e) => onChange({ hint: e.target.value })}
                  placeholder="Short hint (optional)"
                  className={input}
                />
              </div>
            </div>

            <ScheduleEditor days={section.days} onChange={(days) => onChange({ days })} />

            <div className="mt-4 flex flex-col gap-4">
              {section.fields.map((field, fi) => (
                <FieldEditor
                  key={field.key}
                  field={field}
                  spec={spec}
                  sectionIndex={index}
                  fieldIndex={fi}
                  isFirst={fi === 0}
                  isLast={fi === section.fields.length - 1}
                  onChange={(patch) => updateField(fi, patch)}
                  onMove={(dir) => moveField(fi, dir)}
                  onRemove={section.fields.length > 1 ? () => removeField(fi) : undefined}
                />
              ))}
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-2">
              <Chip small on={false} onClick={addField}>
                <Plus size={12} className="mr-1 inline" />
                Add question
              </Chip>
              <div className="ml-auto flex items-center gap-1">
                <button type="button" onClick={() => onMove(-1)} disabled={index === 0} className="chip rounded-full px-2.5 py-1.5 text-xs disabled:opacity-30">
                  Move up
                </button>
                <button type="button" onClick={() => onMove(1)} disabled={index === total - 1} className="chip rounded-full px-2.5 py-1.5 text-xs disabled:opacity-30">
                  Move down
                </button>
                <button type="button" onClick={onRemove} className="flex items-center gap-1 rounded-full px-2.5 py-1.5 text-xs text-danger hover:brightness-90">
                  <Trash2 size={12} /> Remove
                </button>
              </div>
            </div>
          </div>
      </Fold>
    </section>
  );
}

/**
 * "When do you track this?" — the plan the Patterns page measures against. Days a section
 * isn't planned are never counted as missed. Custom is just a view over the same list of
 * days, so switching to it doesn't change anything until you toggle a day.
 */
function ScheduleEditor({ days, onChange }: { days: number[]; onChange: (days: number[]) => void }) {
  const preset = schedulePreset(days);
  const [customOpen, setCustomOpen] = useState(preset === "custom");
  const showDays = customOpen || preset === "custom";
  const presets: [string, string, number[]][] = [
    ["every", "Every day", EVERY_DAY],
    ["weekdays", "Weekdays", WEEKDAYS_ONLY],
    ["weekends", "Weekends", WEEKENDS_ONLY],
  ];

  return (
    <div className="mt-4">
      <p className="mb-2 text-xs font-medium text-soft">When do you track this?</p>
      <div className="flex flex-wrap gap-1.5">
        {presets.map(([id, label, value]) => (
          <Chip
            key={id}
            small
            on={preset === id && !showDays}
            onClick={() => {
              setCustomOpen(false);
              onChange(value);
            }}
          >
            {label}
          </Chip>
        ))}
        <Chip small on={showDays} onClick={() => setCustomOpen(true)}>
          Custom
        </Chip>
      </div>

      {showDays && (
        <div className="mt-2 flex gap-1.5">
          {WEEKDAYS.map((d, i) => {
            const on = days.includes(i);
            return (
              <button
                key={d}
                type="button"
                aria-pressed={on}
                aria-label={d}
                onClick={() => {
                  const next = on ? days.filter((x) => x !== i) : [...days, i].sort((a, b) => a - b);
                  if (next.length > 0) onChange(next); // a section planned on no days would never be expected
                }}
                className={`chip h-9 min-w-0 flex-1 rounded-full text-xs font-medium ${on ? "bg-ink text-cream" : "text-ink"}`}
              >
                {d}
              </button>
            );
          })}
        </div>
      )}
      <p className="mt-2 text-xs text-soft">Days it isn't planned won't count as missed.</p>
    </div>
  );
}

function IconPicker({ value, onChange }: { value: string; onChange: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  const Icon = iconFor(value);
  return (
    <div className="relative shrink-0">
      <button type="button" onClick={() => setOpen((v) => !v)} aria-label="Choose icon" className="chip flex size-11 items-center justify-center rounded-2xl">
        <Icon size={20} strokeWidth={1.8} />
      </button>
      {open && (
        <div className="card rise absolute left-0 top-full z-10 mt-2 grid w-56 grid-cols-6 gap-1 p-2">
          {ICON_IDS.map((id) => {
            const I = iconFor(id);
            return (
              <button
                key={id}
                type="button"
                onClick={() => {
                  onChange(id);
                  setOpen(false);
                }}
                aria-label={id}
                className={`flex size-8 items-center justify-center rounded-lg transition-colors ${
                  id === value ? "bg-ink text-cream" : "hover:bg-lilac/50"
                }`}
              >
                <I size={16} strokeWidth={1.8} />
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

const KIND_LABEL = { single: "Choice", multi: "Multi-choice", counter: "Counter", amount: "Number" } as const;

function defaultsFor(kind: FieldSpec["kind"], key: string, label: string): FieldSpec {
  if (kind === "counter") return { kind, key, label, max: 10, goal: 5, unit: "times" };
  if (kind === "amount") return { kind, key, label, quick: [1, 2, 5, 10], prefix: "", suffix: "" };
  return {
    kind,
    key,
    label,
    options: [
      { id: "yes", label: "Yes" },
      { id: "no", label: "No" },
    ],
  };
}

function FieldEditor({
  field,
  spec,
  sectionIndex,
  fieldIndex,
  isFirst,
  isLast,
  onChange,
  onMove,
  onRemove,
}: {
  field: FieldSpec;
  spec: HabitSpec;
  sectionIndex: number;
  fieldIndex: number;
  isFirst: boolean;
  isLast: boolean;
  onChange: (patch: Partial<FieldSpec> | ((f: FieldSpec) => FieldSpec)) => void;
  onMove: (dir: -1 | 1) => void;
  onRemove?: () => void;
}) {
  // eligible "only show when" targets: any field earlier in the whole spec, still single/counter/amount
  const earlier: FieldSpec[] = [];
  spec.sections.forEach((s, si) => {
    s.fields.forEach((f, fi) => {
      if (si < sectionIndex || (si === sectionIndex && fi < fieldIndex)) earlier.push(f);
    });
  });
  const eligibleParents = earlier.filter((f) => f.kind === "single" || f.kind === "counter" || f.kind === "amount");

  return (
    <div className="rounded-2xl border border-ink/10 p-3">
      <div className="flex items-start gap-2">
        <input
          value={field.label}
          maxLength={60}
          onChange={(e) => onChange({ label: e.target.value })}
          placeholder="Question"
          className={`${input} flex-1 text-sm font-medium`}
        />
        <div className="flex shrink-0 gap-1">
          <button type="button" onClick={() => onMove(-1)} disabled={isFirst} aria-label="Move up" className="chip flex size-8 items-center justify-center rounded-full disabled:opacity-30">
            <ChevronDown size={14} className="rotate-180" />
          </button>
          <button type="button" onClick={() => onMove(1)} disabled={isLast} aria-label="Move down" className="chip flex size-8 items-center justify-center rounded-full disabled:opacity-30">
            <ChevronDown size={14} />
          </button>
          {onRemove && (
            <button type="button" onClick={onRemove} aria-label="Remove question" className="chip flex size-8 items-center justify-center rounded-full text-danger">
              <Trash2 size={14} />
            </button>
          )}
        </div>
      </div>

      <div className="mt-2 flex flex-wrap gap-1.5">
        {(Object.keys(KIND_LABEL) as (keyof typeof KIND_LABEL)[]).map((k) => (
          <Chip key={k} small on={field.kind === k} onClick={() => onChange(() => defaultsFor(k, field.key, field.label))}>
            {KIND_LABEL[k]}
          </Chip>
        ))}
      </div>

      <div className="mt-3">
        {(field.kind === "single" || field.kind === "multi") && (
          <OptionsEditor tones={field.kind === "single"} options={field.options} onChange={(options) => onChange({ options })} />
        )}
        {field.kind === "counter" && (
          <div className="flex flex-wrap gap-3 text-xs">
            <label className="flex items-center gap-1.5">
              Hit at least
              <input
                type="number"
                min={1}
                max={field.max}
                value={field.goal}
                onChange={(e) => onChange({ goal: Math.max(1, Math.min(field.max, Number(e.target.value) || 1)) })}
                className={`${input} w-16 py-1`}
              />
            </label>
            <label className="flex items-center gap-1.5">
              Max
              <input
                type="number"
                min={field.goal}
                max={60}
                value={field.max}
                onChange={(e) => onChange({ max: Math.max(field.goal, Math.min(60, Number(e.target.value) || field.goal)) })}
                className={`${input} w-16 py-1`}
              />
            </label>
            <label className="flex items-center gap-1.5">
              Unit
              <input value={field.unit} maxLength={20} onChange={(e) => onChange({ unit: e.target.value })} className={`${input} w-24 py-1`} />
            </label>
            <p className="w-full text-xs text-soft">Falling short counts as a slip once the day is over.</p>
          </div>
        )}
        {field.kind === "amount" && (
          <div className="flex flex-wrap gap-3 text-xs">
            <label className="flex items-center gap-1.5">
              Before the number
              <input
                value={field.prefix}
                maxLength={6}
                placeholder="e.g. ₹"
                onChange={(e) => onChange({ prefix: e.target.value })}
                className={`${input} w-16 py-1`}
              />
            </label>
            <label className="flex items-center gap-1.5">
              After the number
              <input
                value={field.suffix}
                maxLength={6}
                placeholder="e.g. hrs"
                onChange={(e) => onChange({ suffix: e.target.value })}
                className={`${input} w-16 py-1`}
              />
            </label>
            <label className="flex items-center gap-1.5">
              Quick-add buttons (comma separated)
              <input
                defaultValue={field.quick.join(", ")}
                onBlur={(e) => {
                  const quick = e.target.value
                    .split(",")
                    .map((s) => Math.round(Number(s.trim())))
                    .filter((n) => Number.isFinite(n) && n > 0)
                    .slice(0, 6);
                  onChange({ quick: quick.length ? quick : field.quick });
                }}
                className={`${input} w-40 py-1`}
              />
            </label>
            <div className="flex w-full flex-wrap items-center gap-2">
              <span className="font-medium text-soft">Target</span>
              <select
                value={field.target?.op ?? "none"}
                onChange={(e) => {
                  const op = e.target.value;
                  // start from your biggest quick-add so "Up to" never begins at 0 (where any spend is a slip)
                  if (op === "atLeast" || op === "atMost") onChange({ target: { op, value: field.target?.value ?? field.quick[field.quick.length - 1] ?? 1 } });
                  else onChange({ target: undefined });
                }}
                className={`${inputBase} appearance-none rounded-full py-1.5`}
              >
                <option value="none">None</option>
                <option value="atMost">Up to</option>
                <option value="atLeast">At least</option>
              </select>
              {field.target && (
                <label className="flex items-center gap-1">
                  {field.prefix}
                  {/* committed on blur so clearing the box to retype doesn't snap to 0 mid-edit */}
                  <input
                    key={field.target.value}
                    type="number"
                    min={0}
                    inputMode="decimal"
                    defaultValue={field.target.value}
                    aria-label="Target amount"
                    onBlur={(e) => {
                      const n = Number(e.target.value);
                      if (e.target.value !== "" && Number.isFinite(n) && n >= 0 && field.target) {
                        onChange({ target: { op: field.target.op, value: Math.min(1_000_000, n) } });
                      } else e.target.value = String(field.target?.value ?? 0);
                    }}
                    onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
                    className={`${inputBase} w-24 py-1`}
                  />
                  {field.suffix}
                </label>
              )}
              <p className="w-full text-xs text-soft">
                {field.target
                  ? field.target.op === "atMost"
                    ? "Going over it counts as a slip."
                    : "Falling short counts as a slip once the day is over."
                  : "Optional. Set one and Patterns will show the days you missed it."}
              </p>
            </div>
          </div>
        )}
      </div>

      {breakdownOf(spec, field) && (
        <p className="mt-2 text-xs text-soft">
          This breaks down &ldquo;{breakdownOf(spec, field)?.label}&rdquo;: each pick you choose on Today can get its own optional amount.
        </p>
      )}

      <ConditionEditor field={field} eligibleParents={eligibleParents} onChange={onChange} />
    </div>
  );
}

function TonePicker({ value, onChange }: { value: Tone | undefined; onChange: (t: Tone | undefined) => void }) {
  const options: { id: Tone | "none"; swatch: string; label: string }[] = [
    { id: "none", swatch: "bg-ink/15", label: "No tone" },
    { id: "good", swatch: "bg-good", label: "Good" },
    { id: "meh", swatch: "bg-meh", label: "Meh" },
    { id: "bad", swatch: "bg-bad", label: "Bad" },
  ];
  return (
    <div className="flex shrink-0 items-center gap-1.5">
      {options.map((o) => {
        const on = (value ?? "none") === o.id;
        return (
          <button
            key={o.id}
            type="button"
            title={o.label}
            aria-label={o.label}
            aria-pressed={on}
            onClick={() => onChange(o.id === "none" ? undefined : o.id)}
            className={`size-6 rounded-full transition-[transform,opacity,box-shadow] ${o.swatch} ${on ? "scale-110 ring-2 ring-ink ring-offset-1 ring-offset-surface" : "opacity-50 hover:opacity-90"}`}
          />
        );
      })}
    </div>
  );
}

function OptionsEditor({
  options,
  tones,
  onChange,
}: {
  options: OptionSpec[];
  /** single choice only: there, an option's color decides what counts as a slip. On a
   *  multi-choice (e.g. which muscles you hit) nothing can slip, so no colors are offered. */
  tones: boolean;
  onChange: (options: OptionSpec[]) => void;
}) {
  const usedIds = new Set(options.map((o) => o.id));
  // the cutoff rewrites every color at once, so it stays tucked away until asked for
  const [cutoff, setCutoff] = useState(false);

  function update(i: number, patch: Partial<OptionSpec>) {
    onChange(options.map((o, j) => (j === i ? { ...o, ...patch } : o)));
  }
  function remove(i: number) {
    onChange(options.filter((_, j) => j !== i));
  }
  function add() {
    const label = "New option";
    let id = label.toLowerCase().replace(/\s+/g, "_");
    let n = 2;
    while (usedIds.has(id)) id = `option_${n++}`;
    onChange([...options, { id, label }]);
  }

  return (
    <div className="space-y-1.5">
      {options.map((o, i) => (
        <div key={o.id} className="flex items-center gap-2">
          <input value={o.label} maxLength={30} onChange={(e) => update(i, { label: e.target.value })} className={`${input} flex-1 py-1.5 text-sm`} />
          {tones && <TonePicker value={o.tone} onChange={(tone) => update(i, { tone })} />}
          {options.length > 2 && (
            <button type="button" onClick={() => remove(i)} aria-label="Remove option" className="chip flex size-7 items-center justify-center rounded-full text-danger">
              <Trash2 size={12} />
            </button>
          )}
        </div>
      ))}
      <button
        type="button"
        onClick={add}
        disabled={options.length >= LIMITS.options}
        className="flex items-center gap-1 text-xs text-soft hover:text-ink disabled:opacity-40"
      >
        <Plus size={12} /> Add option
      </button>
      <p className="text-xs text-soft">Removing an option keeps it on the days you used it, as a day-only pick.</p>

      {tones && (
        <div className="space-y-1.5 border-t border-ink/10 pt-2 text-xs text-soft">
          <p>Orange means a slip on Patterns. Yellow and green don&apos;t.</p>
          {options.length >= 3 &&
            (cutoff ? (
              <label className="flex flex-wrap items-center gap-2">
                Good from (everything before it becomes a slip)
                <select
                  value=""
                  onChange={(e) => {
                    const at = options.findIndex((o) => o.id === e.target.value);
                    if (at >= 0) onChange(options.map((o, j) => ({ ...o, tone: j < at ? "bad" : "good" })));
                    setCutoff(false);
                  }}
                  className={`${inputBase} appearance-none rounded-full py-1 text-xs`}
                >
                  <option value="">pick one…</option>
                  {options.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.label}
                    </option>
                  ))}
                </select>
                <button type="button" onClick={() => setCutoff(false)} className="underline underline-offset-2 hover:text-ink">
                  Cancel
                </button>
              </label>
            ) : (
              <button type="button" onClick={() => setCutoff(true)} className="underline underline-offset-2 hover:text-ink">
                Ordered scale, like hours? Set a cutoff
              </button>
            ))}
        </div>
      )}
    </div>
  );
}

function ConditionEditor({
  field,
  eligibleParents,
  onChange,
}: {
  field: FieldSpec;
  eligibleParents: FieldSpec[];
  onChange: (patch: Partial<FieldSpec>) => void;
}) {
  const [on, setOn] = useState(Boolean(field.showIf));
  if (eligibleParents.length === 0) return null;

  function setParent(key: string) {
    const parent = eligibleParents.find((f) => f.key === key);
    if (!parent) return onChange({ showIf: undefined });
    if (parent.kind === "counter" || parent.kind === "amount") {
      onChange({ showIf: { field: key, greaterThanZero: true } });
    } else {
      const opt = parent.options[0]?.id ?? "";
      onChange({ showIf: { field: key, equals: opt } });
    }
  }

  const cond = field.showIf;
  const parent = cond ? eligibleParents.find((f) => f.key === cond.field) : undefined;

  return (
    <div className="mt-3 border-t border-ink/10 pt-3 text-xs">
      <label className="flex items-center gap-2 font-medium text-soft">
        <input
          type="checkbox"
          checked={on}
          onChange={(e) => {
            setOn(e.target.checked);
            if (e.target.checked) setParent(eligibleParents[0].key);
            else onChange({ showIf: undefined });
          }}
        />
        Only show after another answer
      </label>

      {on && cond && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <select value={cond.field} onChange={(e) => setParent(e.target.value)} className={`${select} rounded-full py-1.5`}>
            {eligibleParents.map((p) => (
              <option key={p.key} value={p.key}>
                {p.label}
              </option>
            ))}
          </select>
          {parent && parent.kind === "single" && ("equals" in cond || "notEquals" in cond) ? (
            <>
              <span>{"equals" in cond ? "is" : "is not"}</span>
              <select
                value={"equals" in cond ? cond.equals : cond.notEquals}
                onChange={(e) =>
                  onChange({ showIf: "equals" in cond ? { field: parent.key, equals: e.target.value } : { field: parent.key, notEquals: e.target.value } })
                }
                className={`${select} rounded-full py-1.5`}
              >
                {parent.options.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.label}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() =>
                  onChange({
                    showIf: "equals" in cond ? { field: parent.key, notEquals: cond.equals } : { field: parent.key, equals: cond.notEquals },
                  })
                }
                className="text-soft underline underline-offset-2 hover:text-ink"
              >
                switch to &quot;{"equals" in cond ? "is not" : "is"}&quot;
              </button>
            </>
          ) : (
            <span>is greater than 0</span>
          )}
        </div>
      )}
    </div>
  );
}
