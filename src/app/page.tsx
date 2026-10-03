import { auth } from "@clerk/nextjs/server";
import { getDb } from "@/lib/db";
import { readSnapshot } from "@/lib/snapshot";
import { Tracker } from "@/components/tracker";
import { Welcome } from "@/components/welcome";

export default async function Home() {
  const { userId } = await auth();
  if (!userId) return null; // proxy.ts already redirects signed-out visitors

  const { entries, focuses, plans, spec } = await readSnapshot(getDb(), userId);
  if (!spec) return <Welcome />; // a new account picks what to track before anything else
  return <Tracker initialEntries={entries} initialFocus={focuses} initialPlans={plans} initialSpec={spec} />;
}
