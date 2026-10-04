import { auth } from "@clerk/nextjs/server";
import { cookies, headers } from "next/headers";
import { getDb } from "@/lib/db";
import { hourIn, pickZone, todayIn, TZ_COOKIE } from "@/lib/clock";
import { DISMISS_COOKIE, parseDismissed } from "@/lib/dismissed";
import { readSnapshot } from "@/lib/snapshot";
import { cleanUrl, TITLE_MAX } from "@/lib/shop";
import { Tracker } from "@/components/tracker";

export default async function Home({ searchParams }: { searchParams: Promise<{ shop?: string; u?: string; t?: string }> }) {
  const { userId, getToken } = await auth();
  if (!userId) return null; // proxy.ts already redirects signed-out visitors

  const [token, jar, hdrs] = await Promise.all([getToken(), cookies(), headers()]);
  // The server draws Today for the day it is where you are: the zone your browser told us last time,
  // else Vercel's guess from your connection. The browser corrects it on arrival if that was wrong.
  const zone = pickZone(jar.get(TZ_COOKIE)?.value, hdrs.get("x-vercel-ip-timezone"));
  const now = new Date();
  // opened from Share -> Qwency: start on Shop with the title and link filled in
  const q = await searchParams;
  const share = q.shop === "1" ? { title: String(q.t ?? "").slice(0, TITLE_MAX), url: cleanUrl(q.u) } : null;

  // Started here, read by the page as it arrives: the shell is sent and the app's code starts
  // downloading while the database answers, instead of everything waiting for it.
  const snapshot = readSnapshot(getDb(token), userId);
  snapshot.catch(() => {}); // a failure is raised where it's read (error.tsx); this only stops Node flagging it early

  return (
    <Tracker
      snapshot={snapshot}
      userId={userId}
      today={todayIn(zone, now)}
      hour={hourIn(zone, now)}
      dismissed={parseDismissed(jar.get(DISMISS_COOKIE)?.value)}
      share={share}
    />
  );
}
