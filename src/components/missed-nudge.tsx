"use client";

import { useState } from "react";
import { WHY_TAGS } from "@/lib/tracker";
import { WhySelector } from "./why-selector";

/**
 * Shown on a past day when a planned section has nothing logged. One quiet line, closed by
 * default so a day with several blanks doesn't turn into a wall of prompts; tapping it opens
 * the reason chips. Once a reason is picked, the line becomes the reason itself.
 */
export function MissedNudge({ tags, onChange }: { tags: string[]; onChange: (tags: string[]) => void }) {
  const [open, setOpen] = useState(tags.length > 0);
  const said = tags.map((t) => WHY_TAGS.find((w) => w.id === t)?.label ?? t);

  return (
    <div className="pt-3">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="text-left text-sm text-ink/80 underline decoration-ink/30 decoration-dotted underline-offset-4 transition-colors hover:text-ink"
      >
        {said.length > 0 ? `Not logged. Why: ${said.join(", ")}` : "Nothing logged for this one. Want to say why?"}
      </button>
      <WhySelector tags={tags} open={open} onChange={onChange} small prompt="No judgment — what got in the way?" />
    </div>
  );
}
