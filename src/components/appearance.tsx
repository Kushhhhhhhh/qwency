"use client";

import { useSyncExternalStore } from "react";
import { Check } from "lucide-react";
import { PALETTES, PALETTE_HINT, PALETTE_KEY, PALETTE_NAME, isPalette, paletteFor, syncBarColor, type Palette, type PaletteChoice } from "@/lib/theme";

// The colours the app wears. Remembered in this browser (like light / dark, which is the little button at the
// top), so each device and each friend can pick their own; with no pick it follows the month. The page is
// recoloured by one attribute on <html>; nothing about your days changes.

const CHANGED = "qwency:palette-changed";

function subscribe(onChange: () => void) {
  window.addEventListener(CHANGED, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(CHANGED, onChange);
    window.removeEventListener("storage", onChange);
  };
}

// read from outside the render, so the screen never calls the clock or the storage while drawing
function savedChoice(): PaletteChoice {
  try {
    const v = localStorage.getItem(PALETTE_KEY);
    return isPalette(v) ? v : "auto";
  } catch {
    return "auto";
  }
}
const monthsPalette = (): Palette => paletteFor("auto", new Date().getMonth());
const serverChoice = (): PaletteChoice => "auto";
const serverPalette = (): Palette => "qwency";

function choose(choice: PaletteChoice) {
  try {
    if (choice === "auto") localStorage.removeItem(PALETTE_KEY);
    else localStorage.setItem(PALETTE_KEY, choice);
  } catch {
    /* private window: it still changes, it just isn't remembered */
  }
  document.documentElement.setAttribute("data-palette", paletteFor(choice, new Date().getMonth()));
  syncBarColor();
  window.dispatchEvent(new Event(CHANGED));
}

// three dots in the palette's tile colours, drawn as backgrounds so a swatch is one element, not four
const DOTS = [1, 2, 3].map((n, i) => `radial-gradient(circle at ${25 + i * 25}% 50%, var(--color-tile-${n}) 0 0.42rem, transparent 0.47rem)`).join(", ");

/** A little swatch wearing a palette's own colours (the palette's rules apply to any element carrying data-palette). */
function Swatch({ palette }: { palette: Palette }) {
  return <span data-palette={palette} aria-hidden className="h-10 w-16 shrink-0 rounded-xl border border-ink/25 bg-cream" style={{ backgroundImage: DOTS }} />;
}

export function Appearance() {
  const choice = useSyncExternalStore(subscribe, savedChoice, serverChoice);
  const now = useSyncExternalStore(subscribe, monthsPalette, serverPalette);

  const options: { id: PaletteChoice; name: string; hint: string; swatch: Palette }[] = [
    { id: "auto", name: "Auto", hint: `Follows the month. ${PALETTE_NAME[now]} for now`, swatch: now },
    ...PALETTES.map((p) => ({ id: p, name: PALETTE_NAME[p], hint: PALETTE_HINT[p], swatch: p })),
  ];

  return (
    <section className="card p-5">
      <h2 className="text-base font-semibold">Colours</h2>
      <p className="mt-1 text-sm text-soft">
        Only the colours change, never your days. It applies right away, on this device. Light and dark is the little button at the top.
      </p>
      <div role="radiogroup" aria-label="Colours" className="mt-3 grid gap-2">
        {options.map((o) => {
          const on = choice === o.id;
          return (
            <button
              key={o.id}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => choose(o.id)}
              className={`chip flex items-center gap-3 rounded-2xl px-3 py-2.5 text-left transition-colors ${on ? "border-ink bg-ink/10" : ""}`}
            >
              <Swatch palette={o.swatch} />
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold">{o.name}</span>
                <span className="block text-xs text-soft">{o.hint}</span>
              </span>
              {on && <Check size={18} strokeWidth={2.5} className="shrink-0" />}
            </button>
          );
        })}
      </div>
    </section>
  );
}
