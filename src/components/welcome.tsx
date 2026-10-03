"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check } from "lucide-react";
import { saveSpec } from "@/app/actions";
import { DEFAULT_SPEC, LIMITS, scheduleLabel, type HabitSpec } from "@/lib/spec";
import { TEMPLATES, buildStarter } from "@/lib/templates";
import { iconFor } from "@/lib/icons";
import { localKey } from "@/lib/tracker";
import { UserMenu } from "./user-menu";

/**
 * The first thing a new account sees. It doesn't inherit anyone's setup: it picks the parts of
 * its day it cares about, and every choice can be changed later in Setup. Nothing is tracked
 * that wasn't picked here.
 */
export function Welcome() {
  const router = useRouter();
  const [picked, setPicked] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(false);

  const full = picked.length >= LIMITS.sections;

  function toggle(id: string) {
    setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : p.length >= LIMITS.sections ? p : [...p, id]));
  }

  async function start(spec: HabitSpec) {
    setSaving(true);
    setError(false);
    let ok = false;
    try {
      ok = (await saveSpec(spec, localKey(new Date()))).ok;
    } catch {
      ok = false;
    }
    if (ok) router.refresh(); // the page now finds a setup and shows the app
    else {
      setSaving(false);
      setError(true);
    }
  }

  return (
    <div className="mx-auto w-full max-w-xl flex-1 px-4 pb-36 pt-6">
      <header className="mb-8 flex items-center justify-between">
        <p className="text-sm font-semibold tracking-tight">Qwency</p>
        <UserMenu size={40} />
      </header>

      <p className="text-xs font-medium uppercase tracking-wider text-ink/60">Welcome</p>
      <h1 className="mt-1 text-3xl font-semibold leading-tight tracking-tight">What do you want to look at?</h1>
      <p className="mt-3 text-[15px] leading-relaxed text-ink/75">
        Pick the parts of your day you care about. Qwency shows you what actually happened, where it slipped, and why, with no
        scores and no judgment. Change, add or remove any of it later.
      </p>

      <ul className="mt-6 grid gap-3 sm:grid-cols-2">
        {TEMPLATES.map((t) => {
          const on = picked.includes(t.id);
          const Icon = iconFor(t.section.icon);
          const blocked = !on && full;
          return (
            <li key={t.id}>
              <button
                type="button"
                aria-pressed={on}
                disabled={blocked}
                onClick={() => toggle(t.id)}
                className={`flex h-full w-full items-start gap-3 rounded-2xl border p-4 text-left transition-[background-color,border-color,box-shadow,transform] duration-200 active:scale-[0.98] disabled:opacity-40 ${
                  on ? "border-transparent bg-ink text-cream shadow-lg shadow-ink/25" : "chip"
                }`}
              >
                <span className={`flex size-10 shrink-0 items-center justify-center rounded-xl ${on ? "bg-cream/15" : "bg-lilac/50"}`}>
                  <Icon size={20} strokeWidth={1.8} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className="text-[15px] font-semibold leading-tight">{t.title}</span>
                    {on && <Check size={15} strokeWidth={3} className="check-pop" />}
                  </span>
                  <span className={`mt-1 block text-xs leading-snug ${on ? "text-cream/80" : "text-ink/65"}`}>{t.blurb}</span>
                  <span className={`mt-1.5 block text-[11px] font-medium ${on ? "text-cream/70" : "text-ink/50"}`}>{scheduleLabel(t.section.days)}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      <p className="mt-5 text-sm text-ink/65">
        Every day also asks for one honest verdict, Good, Okay or Rough, whatever you pick.
        {full && ` That's ${LIMITS.sections} sections, the most a day can hold and still stay quick.`}
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
        <button
          type="button"
          onClick={() => start(buildStarter(["sleep", "move", "focus", "spend"]))}
          disabled={saving}
          className="text-ink/60 underline underline-offset-2 hover:text-ink disabled:opacity-50"
        >
          Or start with a suggested few
        </button>
        <span aria-hidden className="text-ink/30">
          ·
        </span>
        <button
          type="button"
          onClick={() => start(DEFAULT_SPEC)}
          disabled={saving}
          className="text-ink/60 underline underline-offset-2 hover:text-ink disabled:opacity-50"
        >
          Use the example setup
        </button>
      </div>

      <div className="fixed bottom-5 left-1/2 z-20 flex -translate-x-1/2 flex-col items-center gap-2">
        {error && (
          <p role="alert" className="rounded-full bg-bad px-4 py-1.5 text-sm font-medium text-[#2b2946] shadow-lg shadow-ink/20">
            Couldn&apos;t save. Check your connection and try again.
          </p>
        )}
        <button
          type="button"
          disabled={picked.length === 0 || saving}
          onClick={() => start(buildStarter(picked))}
          className="rounded-full bg-ink px-7 py-3 text-sm font-semibold text-cream shadow-xl shadow-ink/30 transition-[transform,opacity] duration-200 active:scale-95 disabled:opacity-50"
        >
          {saving ? "Setting up…" : picked.length === 0 ? "Pick at least one" : `Start with ${picked.length}`}
        </button>
      </div>
    </div>
  );
}
