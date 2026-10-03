// Shown while your days are being read: the shape of the page, so it doesn't jump when it arrives.
export default function Loading() {
  return (
    <div className="mx-auto w-full max-w-xl flex-1 px-4 pb-32 pt-6" aria-busy="true" aria-label="Loading your days">
      <div className="mb-5 flex items-center gap-3">
        <div className="flex-1 space-y-2">
          <div className="h-7 w-28 rounded-lg bg-ink/10 motion-safe:animate-pulse" />
          <div className="h-4 w-44 rounded-md bg-ink/5 motion-safe:animate-pulse" />
        </div>
        <div className="size-12 rounded-full bg-ink/10 motion-safe:animate-pulse" />
      </div>
      <div className="flex gap-2 overflow-hidden py-1">
        {Array.from({ length: 7 }, (_, i) => (
          <div key={i} className="h-[72px] w-12 shrink-0 rounded-2xl bg-ink/5 motion-safe:animate-pulse" />
        ))}
      </div>
      <div className="mt-4 flex flex-col gap-4">
        {Array.from({ length: 3 }, (_, i) => (
          <div key={i} className="h-36 rounded-3xl bg-ink/5 motion-safe:animate-pulse" style={{ animationDelay: `${i * 120}ms` }} />
        ))}
      </div>
    </div>
  );
}
