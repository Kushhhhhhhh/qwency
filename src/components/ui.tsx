"use client";

import type { ReactNode } from "react";

const DOT: Record<string, string> = { good: "bg-good", meh: "bg-meh", bad: "bg-bad" };

export function Chip({
  on,
  tone,
  onClick,
  children,
  small,
}: {
  on: boolean;
  tone?: "good" | "meh" | "bad";
  onClick: () => void;
  children: ReactNode;
  small?: boolean;
}) {
  return (
    <button
      type="button"
      data-on={on}
      aria-pressed={on}
      onClick={onClick}
      className={`chip rounded-full font-medium ${small ? "px-3 py-1.5 text-xs" : "px-4 py-2 text-sm"} ${
        on ? "bg-ink text-cream shadow-md shadow-ink/30" : "text-ink"
      }`}
    >
      {tone && <span className={`mr-2 inline-block size-2 rounded-full align-middle ${DOT[tone]}`} />}
      {children}
    </button>
  );
}

export function ProgressRing({ value, total, size = 52 }: { value: number; total: number; size?: number }) {
  const r = (size - 6) / 2;
  const c = 2 * Math.PI * r;
  const done = value >= total;
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={5} className="stroke-ink/10" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={5}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - value / total)}
          className={`transition-[stroke-dashoffset,stroke] duration-500 ease-out ${done ? "stroke-good" : "stroke-ink"}`}
        />
      </svg>
      <span key={value} className="bump absolute inset-0 flex items-center justify-center text-[13px] font-semibold tabular-nums">
        {value}/{total}
      </span>
    </div>
  );
}
