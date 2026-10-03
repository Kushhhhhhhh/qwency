type IdleWindow = Window & {
  requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
  cancelIdleCallback?: (id: number) => void;
};

/**
 * Run `fn` once the browser has nothing better to do (at the latest after `timeout` ms). Safari has no
 * requestIdleCallback, so there it's a short timer. Returns a function that cancels it.
 */
export function whenIdle(fn: () => void, timeout = 2000): () => void {
  const w = window as IdleWindow;
  if (w.requestIdleCallback) {
    const id = w.requestIdleCallback(fn, { timeout });
    return () => w.cancelIdleCallback?.(id);
  }
  const id = window.setTimeout(fn, 300);
  return () => window.clearTimeout(id);
}
