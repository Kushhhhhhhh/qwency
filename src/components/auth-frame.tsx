import type { ReactNode } from "react";
import { ThemeToggle } from "./theme-toggle";

// What the sign-in and sign-up pages show while Clerk's script is still on its way: the name and a
// card-shaped placeholder, so the page has real content on the first paint and nothing jumps when the
// form arrives. The form sits below the name (not centred around it) so it can be any height.

export function AuthFrame({ children }: { children: ReactNode }) {
  return (
    <main className="relative flex flex-1 flex-col items-center gap-6 px-6 pb-10 pt-[12vh]">
      <ThemeToggle className="absolute right-4 top-4" />
      <header className="text-center">
        <p className="text-3xl font-semibold tracking-tight">Qwency</p>
        <p className="mt-1 text-sm text-soft">See what your days actually add up to.</p>
      </header>
      {children}
    </main>
  );
}

export function AuthCardSkeleton() {
  return <div aria-hidden className="h-104 w-full max-w-100 rounded-3xl bg-surface/60 shadow-sm" />;
}
