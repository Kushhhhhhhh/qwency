"use client";

import { useEffect, useState, type ReactNode } from "react";

/**
 * An open/close region (the animation lives in the `.fold` styles) whose contents are only built the
 * first time it opens, and kept after that. A closed one costs one empty box instead of everything
 * inside it, which matters when most of a long screen is folded away: a day's cards hold a note box
 * and a "why did this slip" picker each, and Setup holds a full editor per section.
 */
export function Fold({ open, children }: { open: boolean; children: ReactNode }) {
  const [seen, setSeen] = useState(open);
  useEffect(() => {
    if (open) setSeen(true); // keep what was built, so closing it doesn't throw away what was typed
  }, [open]);

  return (
    <div className="fold" data-open={open} inert={!open}>
      <div>{open || seen ? children : null}</div>
    </div>
  );
}
