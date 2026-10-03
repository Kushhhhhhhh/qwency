import { Activity, BookOpen, ListChecks, Settings2 } from "lucide-react";

// The parts of the screen that don't depend on anyone's data. They render on the server from the
// first byte (so the page has real words and its real shape straight away) and the interactive app
// takes over in the same places, so nothing moves when it arrives.

export type Tab = "today" | "patterns" | "journal" | "setup";

const TABS = [
  ["today", "Today", ListChecks],
  ["patterns", "Patterns", Activity],
  ["journal", "Journal", BookOpen],
  ["setup", "Setup", Settings2],
] as const;

/** The bottom bar. Without `onTab` it is just the picture of it (shown while the app is loading). */
export function Nav({ tab, onTab, onWarm }: { tab: Tab; onTab?: (t: Tab) => void; onWarm?: (t: Tab) => void }) {
  return (
    <nav className="fixed bottom-5 left-1/2 z-10 flex -translate-x-1/2 gap-0.5 rounded-full border border-ink/10 bg-white/80 p-1 shadow-xl shadow-ink/15 backdrop-blur-md">
      {TABS.map(([id, label, Icon]) => (
        <button
          key={id}
          type="button"
          onClick={onTab ? () => onTab(id) : undefined}
          // a tab's code starts downloading as soon as a finger or pointer is on its way to it
          onPointerEnter={onWarm ? () => onWarm(id) : undefined}
          onFocus={onWarm ? () => onWarm(id) : undefined}
          onTouchStart={onWarm ? () => onWarm(id) : undefined}
          aria-current={tab === id}
          aria-label={label}
          className={`flex items-center gap-1.5 rounded-full px-3.5 py-2.5 text-sm font-medium transition-[background-color,color,transform] duration-200 active:scale-95 sm:px-4 ${
            tab === id ? "bg-ink text-cream" : "text-ink/60 hover:text-ink"
          }`}
        >
          <Icon size={17} strokeWidth={2} />
          <span className="hidden sm:inline">{label}</span>
        </button>
      ))}
    </nav>
  );
}

const bone = "bg-ink/5 motion-safe:animate-pulse";

/** Today, before its data has arrived: the real heading and date, and the shape of what's coming. */
export function TodayShell({ dateText }: { dateText?: string }) {
  return (
    <div className="mx-auto w-full max-w-xl flex-1 px-4 pb-32 pt-6" aria-busy="true">
      <header className="mb-5 flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-semibold tracking-tight">Today</h1>
          <p className="min-h-5 truncate text-sm text-ink/60">{dateText ?? " "}</p>
        </div>
        <div className="size-13 shrink-0 rounded-full bg-ink/5" />
        <div className="size-12 shrink-0 rounded-full bg-ink/10" />
      </header>
      <div className="flex flex-col gap-4">
        <div className="-mx-4 flex gap-2 overflow-hidden px-4 py-1">
          {Array.from({ length: 7 }, (_, i) => (
            <div key={i} className={`h-18 w-12 shrink-0 rounded-2xl ${bone}`} />
          ))}
        </div>
        {Array.from({ length: 3 }, (_, i) => (
          <div key={i} className={`h-36 rounded-3xl ${bone}`} style={{ animationDelay: `${i * 120}ms` }} />
        ))}
      </div>
      <Nav tab="today" />
    </div>
  );
}

/** While a tab's code is still arriving (the first time it's opened). */
export function TabSkeleton() {
  return (
    <div className="flex flex-col gap-4" aria-busy="true" aria-label="Loading">
      {Array.from({ length: 3 }, (_, i) => (
        <div key={i} className={`h-36 rounded-3xl ${bone}`} style={{ animationDelay: `${i * 120}ms` }} />
      ))}
    </div>
  );
}
