"use client";

import { useEffect, useState } from "react";
import { UserButton } from "@clerk/nextjs";
import { whenIdle } from "@/lib/idle";

/**
 * The avatar menu. Its space is reserved from the first paint (no shifting when Clerk arrives), and
 * the real button only mounts once the page has settled and the browser is idle, so Clerk's UI
 * bundle doesn't compete with the app for the first seconds of a slow connection.
 */
export function UserMenu({ size = 48 }: { size?: number }) {
  const [ready, setReady] = useState(false);

  useEffect(() => whenIdle(() => setReady(true)), []);

  const placeholder = <div className="rounded-full bg-ink/10" style={{ width: size, height: size }} />;

  return (
    <div className="shrink-0" style={{ width: size, height: size }}>
      {ready ? (
        <UserButton
          fallback={placeholder}
          appearance={{ elements: { avatarBox: { width: size, height: size, boxShadow: "0 0 0 2px color-mix(in oklab, var(--color-ink) 15%, transparent)" } } }}
        />
      ) : (
        placeholder
      )}
    </div>
  );
}
