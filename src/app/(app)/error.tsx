"use client";

import { useEffect } from "react";

// What anyone sees if loading their days fails (a connection hiccup, the database waking up),
// instead of a raw error page. Nothing is lost: it only means the page couldn't be read.
export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col justify-center px-4 py-16">
      <div className="card p-6">
        <p className="text-xs font-medium uppercase tracking-wider text-soft">One second</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">Couldn&apos;t load your days</h1>
        <p className="mt-3 text-[15px] leading-relaxed text-soft">
          Your data is safe. This is almost always a connection hiccup, and trying again usually fixes it.
        </p>
        <div className="mt-5 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={reset}
            className="rounded-full bg-ink px-6 py-2.5 text-sm font-semibold text-cream shadow-lg shadow-shade/25 transition-transform active:scale-95"
          >
            Try again
          </button>
          <button type="button" onClick={() => window.location.reload()} className="text-sm text-soft underline underline-offset-2 hover:text-ink">
            Reload the page
          </button>
        </div>
        {error.digest && <p className="mt-5 text-xs text-soft">Reference: {error.digest}</p>}
      </div>
    </main>
  );
}
