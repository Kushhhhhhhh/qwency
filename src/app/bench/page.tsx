// TEMPORARY measurement/visual scaffold (never committed, deleted when this work is done).
// Renders the real Tracker with synthetic data. Only exists when started with QWENCY_BENCH=1.
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

import { Tracker } from "@/components/tracker";
import { DEFAULT_SPEC, sanitizeSpec, type Data } from "@/lib/spec";
import { hourIn, pickZone, todayIn } from "@/lib/clock";
import { addDays, type Entries, type Mood } from "@/lib/tracker";

function rng(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export default async function Bench({ searchParams }: { searchParams: Promise<{ mode?: string; delay?: string }> }) {
  if (process.env.QWENCY_BENCH !== "1") notFound();
  const { mode, delay } = await searchParams;
  const wait = Number(delay ?? 0);
  const spec = sanitizeSpec(DEFAULT_SPEC);
  const zone = pickZone();
  const today = todayIn(zone);
  const rand = rng(7);
  const moods: Mood[] = ["good", "meh", "bad"];
  const entries: Entries = {};
  for (let n = 1; n < 120; n++) {
    const date = addDays(today, -n);
    const wk = new Date(date + "T00:00:00Z").getUTCDay();
    const weekday = wk >= 1 && wk <= 5;
    const data: Data = { sleep: rand() < 0.3 ? "opt2" : "opt3", water: Math.floor(rand() * 9), spend: Math.floor(rand() * 400) };
    if (weekday) {
      data.work_mode = rand() < 0.7 ? "office" : "wfh";
      data.work_focus = rand() < 0.6 ? "deep" : "scattered";
      data.gym = rand() < 0.65 ? "trained" : "skipped";
    }
    if (rand() < 0.2) data.sleep_note = "Slept badly, phone late.";
    entries[date] = { mood: moods[Math.floor(rand() * 3)], tags: [], note: rand() < 0.25 ? "Felt steady, got most of it done." : "", data };
  }
  const data = { entries, focuses: { [today.slice(0, 7)]: "Sleep first, then everything else" }, plans: {}, spec };
  // a database that takes `wait` ms to answer: streamed (the page returns at once, the data follows) or awaited (the page holds back until it has it)
  const read = () => new Promise<typeof data>((r) => setTimeout(() => r(data), wait));
  if (mode === "await") {
    const snap = await read();
    return <Tracker snapshot={Promise.resolve(snap)} userId="bench" today={today} hour={hourIn(zone)} dismissed={[]} />;
  }
  return <Tracker snapshot={read()} userId="bench" today={today} hour={hourIn(zone)} dismissed={[]} />;
}
