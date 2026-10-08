"use client";

import { Moon, Sun } from "lucide-react";
import { THEME_KEY, syncBarColor, type Theme } from "@/lib/theme";

/**
 * Light / dark, as one small round button that matches the chips and the day strip. It holds no state of
 * its own: the page already carries the theme (data-theme on <html>, set before the first paint), and
 * both icons are always in the page with CSS showing the right one, so it is correct from the very first
 * frame and never changes size. Kept small so it fits beside the progress ring on a narrow phone.
 */
export function ThemeToggle({ className = "" }: { className?: string }) {
  function toggle() {
    const root = document.documentElement;
    const next: Theme = root.dataset.theme === "dark" ? "light" : "dark";
    root.dataset.theme = next;
    try {
      localStorage.setItem(THEME_KEY, next);
    } catch {
      /* private window: it still switches, it just isn't remembered */
    }
    // the phone's own bar follows (it was set from the device setting, which may not be the choice made here)
    syncBarColor();
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label="Switch between light and dark"
      title="Light / dark"
      className={`hit flex size-8 shrink-0 items-center justify-center rounded-full border border-ink/10 bg-surface/60 text-soft transition-[background-color,color,transform] duration-200 hover:text-ink active:scale-90 sm:size-9 ${className}`}
    >
      <Moon size={16} strokeWidth={2} className="dark:hidden" />
      <Sun size={16} strokeWidth={2} className="hidden dark:block" />
    </button>
  );
}
