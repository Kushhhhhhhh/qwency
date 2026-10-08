"use client";

import { useState, useSyncExternalStore } from "react";
import { X } from "lucide-react";
import { findFacts, type Fact } from "@/lib/facts";
import { HIDDEN_KEY, WAITING, hide, noticingView, parseHidden } from "@/lib/hidden";
import type { HabitSpec } from "@/lib/spec";
import { shortDate, type Entries } from "@/lib/tracker";
import { Fold } from "./fold";

// "Worth noticing": what only your own days can say (lib/facts.ts), with a way to close what you don't want to look
// at again. Closing is remembered in this browser, per fact; the "starts after about 3 weeks" message can be closed
// too and stays closed until there is something to show, and facts come back when they exist.

const CHANGED = "qwency:hidden-changed";

function subscribe(onChange: () => void) {
  window.addEventListener(CHANGED, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(CHANGED, onChange);
    window.removeEventListener("storage", onChange);
  };
}

// read from outside the render, so the screen never touches storage while drawing
function stored(): string {
  try {
    return localStorage.getItem(HIDDEN_KEY) ?? "";
  } catch {
    return "";
  }
}
const onServer = () => "";

function remember(id: string) {
  try {
    localStorage.setItem(HIDDEN_KEY, JSON.stringify(hide(parseHidden(localStorage.getItem(HIDDEN_KEY)), id)));
  } catch {
    /* blocked storage: it is still closed for as long as this screen is open */
  }
  window.dispatchEvent(new Event(CHANGED));
}

export function Noticing({ spec, entries, today, onPick }: { spec: HabitSpec; entries: Entries; today: string; onPick: (date: string) => void }) {
  const saved = parseHidden(useSyncExternalStore(subscribe, stored, onServer));
  const [now, setNow] = useState<string[]>([]);
  const hidden = [...saved, ...now];
  const view = noticingView(findFacts(spec, entries, today, { skip: hidden }), hidden);

  if (view.kind === "none") return null;
  const close = (id: string) => {
    setNow((n) => [...n, id]);
    remember(id);
  };

  return (
    <section className="card p-5" aria-label="Worth noticing">
      <div className="flex items-center gap-3">
        <p className="min-w-0 flex-1 text-xs font-medium uppercase tracking-wider text-soft">Worth noticing</p>
        {view.kind !== "facts" && <CloseButton label="Close this for now" onClick={() => close(WAITING)} />}
      </div>

      {view.kind === "waiting" ? (
        <p className="mt-2 text-sm leading-snug text-soft">
          This starts after about 3 weeks of logging, once there are enough days to compare. {view.need} more logged {view.need === 1 ? "day" : "days"} to go.
        </p>
      ) : view.kind === "quiet" ? (
        <p className="mt-2 text-sm leading-snug text-soft">
          Nothing clearly stands out in your last {view.judged} logged days. Only what holds up is shown, so a quiet card is a fine answer.
        </p>
      ) : (
        <>
          <ul className="mt-2 flex flex-col gap-3.5">
            {view.facts.map((f) => (
              <FactRow key={f.id} fact={f} onPick={onPick} onClose={() => close(f.id)} />
            ))}
          </ul>
          <p className="mt-3 text-xs text-soft">From your last {view.judged} logged days. What went together so far, not proof of cause.</p>
        </>
      )}
    </section>
  );
}

function CloseButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="hit -mr-1 flex size-7 shrink-0 items-center justify-center rounded-full text-soft transition-colors hover:text-ink"
    >
      <X size={15} />
    </button>
  );
}

function FactRow({ fact, onPick, onClose }: { fact: Fact; onPick: (date: string) => void; onClose: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <li className="flex items-start gap-2">
      <div className="min-w-0 flex-1">
        <p className="text-[15px] leading-snug">{fact.text}</p>
        {fact.days.length > 0 && (
          <>
            <button
              type="button"
              aria-expanded={open}
              onClick={() => setOpen((o) => !o)}
              className="hit mt-1 text-xs font-medium text-soft underline underline-offset-2 transition-colors hover:text-ink"
            >
              {open ? "Hide the days" : "See the days"}
            </button>
            <Fold open={open}>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {fact.days.map((d) => (
                  <button key={d} type="button" onClick={() => onPick(d)} className="chip rounded-full px-3 py-1.5 text-xs font-medium">
                    {shortDate(d)}
                  </button>
                ))}
              </div>
            </Fold>
          </>
        )}
      </div>
      <CloseButton label="Don't show this again" onClick={onClose} />
    </li>
  );
}
