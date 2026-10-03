import { useCallback, useEffect, useRef } from "react";

/**
 * A function that never changes identity but always runs the latest `fn`. For handing handlers to
 * children that skip re-drawing when their props are unchanged (tapping one chip shouldn't re-draw
 * every other question): the child sees the same function every time, and it still reads the newest
 * state when called.
 *
 * Kept out of the React Compiler on purpose: it can't follow a function that reads a ref, and trying
 * makes it give up on the whole component that calls this.
 */
export function useStable<A extends unknown[], R>(fn: (...args: A) => R): (...args: A) => R {
  "use no memo";
  const latest = useRef(fn);
  useEffect(() => {
    latest.current = fn;
  });
  return useCallback((...args: A) => latest.current(...args), []);
}
