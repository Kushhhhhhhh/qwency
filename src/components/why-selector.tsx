"use client";

import { WHY_TAGS } from "@/lib/tracker";
import { Chip } from "./ui";

/**
 * "Why did this slip?" — the same shared, fixed reason vocabulary wherever a bad-toned
 * answer shows up (the day verdict, or any single-choice field). Uses the same ink-fill
 * every other selected chip in the app uses. An earlier version filled selected chips
 * lilac for a "this is data, not a verdict" distinction — but section cards are now
 * flat-colored and rotate through lilac/yellow/olive per spec, so a lilac chip could land
 * on a lilac card and disappear. The framing comes from the prompt text instead; the
 * ink-fill is guaranteed to read against any card color. Fully optional; opens via `open`.
 */
export function WhySelector({
  tags,
  open,
  onChange,
  prompt = "No judgment — why did this slip?",
  small,
}: {
  tags: string[];
  open: boolean;
  onChange: (tags: string[]) => void;
  prompt?: string;
  small?: boolean;
}) {
  return (
    <div className="fold" data-open={open} inert={!open}>
      <div>
        <div className={small ? "pt-3" : "pt-5"}>
          <p className={`mb-2 ${small ? "text-xs" : "text-sm font-semibold"} text-ink/80`}>{prompt}</p>
          <div className="flex flex-wrap gap-1.5">
            {WHY_TAGS.map((t) => {
              const on = tags.includes(t.id);
              return (
                <Chip key={t.id} on={on} small={small} onClick={() => onChange(on ? tags.filter((x) => x !== t.id) : [...tags, t.id])}>
                  {t.label}
                </Chip>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
