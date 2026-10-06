"use client";

import { Suspense, startTransition, use, useEffect, useImperativeHandle, useRef, useState, type Ref } from "react";
import dynamic from "next/dynamic";
import { loadSnapshot, patchData, removeItem, saveBudget, saveFocus, saveItem, saveNote, savePlan, saveSpec, saveTags, setMood } from "@/app/actions";
import type { MonthPlan } from "@/lib/goals";
import {
  AWAY_KEY,
  awayLabel,
  awayOf,
  breakdownOf,
  customId,
  CUSTOM_PICK_MAX,
  dayDone,
  dayTotal,
  diffData,
  isExpected,
  isScheduled,
  normalizeEntries,
  pruneHidden,
  sectionDone,
  sectionMissKey,
  sectionNoteKey,
  SECTION_NOTE_MAX,
  specAt,
  startedOn,
  whyKey,
  whyPromptKey,
  type AwayReason,
  type Data,
  type FieldSpec,
  type HabitSpec,
} from "@/lib/spec";
import { reasonWrite, type Step } from "@/lib/checkin";
import {
  EMPTY_ENTRY,
  localKey,
  prettyDate,
  type Entries,
  type Entry,
  type Mood,
} from "@/lib/tracker";
import { TZ_COOKIE } from "@/lib/clock";
import { emptyBox, isEmpty, overlayEntries, overlayFocus, overlayPlans, pendingOps, queue, settle, waitingKeys, type Box, type Op } from "@/lib/outbox";
import { readBox, writeBox } from "@/lib/outbox-store";
import { currencyOf } from "@/lib/shop";
import { whenIdle } from "@/lib/idle";
import { useStable } from "@/lib/use-stable";
import { RECENT_DAYS, type Snapshot } from "@/lib/snapshot";
import { mergeEntries, rollDay, same, sameEntry } from "@/lib/sync";
import { AwayBadge, AwayBanner } from "./away";
import { DayStrip } from "./day-strip";
import { FieldView } from "./field-view";
import { Nudges } from "./nudge";
import { MissedNudge } from "./missed-nudge";
import { NoteField } from "./note-field";
import { DayVerdict, SectionCard, TILE_VARIANTS } from "./section-card";
import { Nav, TabSkeleton, TodayShell, type Tab } from "./shell";
import { ProgressRing } from "./ui";
import { ThemeToggle } from "./theme-toggle";
import { UserMenu } from "./user-menu";

const CHEERS: Record<Mood, string[]> = {
  good: ["Locked in.", "Good day, logged.", "Stacking wins."],
  meh: ["Logged. Honest beats perfect.", "Noted."],
  bad: ["Logged. Now name the cause.", "Rough days are data too."],
};

// Only Today is on screen at first, so the other tabs' code isn't downloaded or run until it's wanted
// (or the browser is idle, or a finger is heading for the tab). They are never drawn by the server.
const loaders = {
  patterns: () => import("./overview"),
  journal: () => import("./journal"),
  shop: () => import("./shop"),
  setup: () => import("./setup"),
};
const Overview = dynamic(() => loaders.patterns().then((m) => m.Overview), { loading: () => <TabSkeleton /> });
const Journal = dynamic(() => loaders.journal().then((m) => m.Journal), { loading: () => <TabSkeleton /> });
const Shop = dynamic(() => loaders.shop().then((m) => m.Shop), { loading: () => <TabSkeleton /> });
const Setup = dynamic(() => loaders.setup().then((m) => m.Setup), { loading: () => <TabSkeleton /> });
const Welcome = dynamic(() => import("./welcome").then((m) => m.Welcome));

function warm(tab: Tab) {
  if (tab !== "today") void loaders[tab]();
}

/** Remember the browser's time zone, so the server can draw the right day next time. */
function rememberZone() {
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const value = encodeURIComponent(zone ?? "");
  if (!zone || document.cookie.includes(`${TZ_COOKIE}=${value}`)) return;
  document.cookie = `${TZ_COOKIE}=${value}; path=/; max-age=31536000; samesite=lax`;
}

type Status = { kind: "idle" | "saving" | "saved" | "error"; text: string; id: number };
type ToastApi = { say: (kind: Status["kind"], text: string) => void };

/** The little "Saving..." / "Saved" pill. It holds its own state, so each blink of it costs one tiny render instead of the whole screen. */
function Toast({ api }: { api: Ref<ToastApi> }) {
  const [status, setStatus] = useState<Status>({ kind: "idle", text: "", id: 0 });
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useImperativeHandle(
    api,
    () => ({
      say(kind, text) {
        if (timer.current) clearTimeout(timer.current);
        setStatus((st) => ({ kind, text, id: st.id + 1 }));
        if (kind === "saved") timer.current = setTimeout(() => setStatus((st) => ({ ...st, kind: "idle" })), 1600);
      },
    }),
    [],
  );
  if (status.kind === "idle") return null;
  return (
    <div
      key={status.id}
      role="status"
      className={`toast-in fixed bottom-24 left-1/2 z-20 -translate-x-1/2 whitespace-nowrap rounded-full px-4 py-2 text-sm font-medium shadow-lg shadow-shade/20 ${
        status.kind === "error"
          ? "bg-bad text-onpastel"
          : status.kind === "saved"
            ? "bg-ink text-cream"
            : "bg-surface text-ink"
      }`}
    >
      {status.text}
    </div>
  );
}

/** Send one change to the server. */
function exec(op: Op): Promise<{ ok: boolean }> {
  switch (op.kind) {
    case "data":
      return patchData(op.date, op.set, op.remove);
    case "mood":
      return setMood(op.date, op.mood);
    case "tags":
      return saveTags(op.date, op.tags);
    case "note":
      return saveNote(op.date, op.note);
    case "focus":
      return saveFocus(op.month, op.text);
    case "plan":
      return savePlan(op.month, op.plan);
    case "item":
      return saveItem(op.item);
    case "itemRemove":
      return removeItem(op.id);
    case "budget":
      return saveBudget(op.month, op.amount);
  }
}

const NOT_SAVED = "Not saved yet. Will retry.";
const SYNC_GAP_MS = 15_000; // returning to the app twice in a row shouldn't hit the server twice

/**
 * The page hands over the database read as a promise instead of waiting for it. The heading, date
 * and shape of Today are on screen straight away; your days drop into the same places when they arrive.
 */
export function Tracker({
  snapshot,
  userId,
  today,
  hour,
  dismissed,
  share = null,
}: {
  snapshot: Promise<Snapshot>;
  userId: string;
  today: string;
  hour: number;
  dismissed: string[];
  /** a title and link shared into the app from a shop (opens Shop with them filled in) */
  share?: { title: string; url: string } | null;
}) {
  return (
    <Suspense fallback={<TodayShell dateText={prettyDate(today)} />}>
      <TrackerLoaded snapshot={snapshot} userId={userId} today={today} hour={hour} dismissed={dismissed} share={share} />
    </Suspense>
  );
}

function TrackerLoaded({
  snapshot,
  userId,
  today,
  hour,
  dismissed,
  share,
}: {
  snapshot: Promise<Snapshot>;
  userId: string;
  today: string;
  hour: number;
  dismissed: string[];
  share: { title: string; url: string } | null;
}) {
  const snap = use(snapshot);
  if (!snap.spec) return <Welcome />; // a new account picks what to track before anything else
  return (
    <TrackerView
      initialEntries={snap.entries}
      initialFocus={snap.focuses}
      initialPlans={snap.plans}
      initialSpec={snap.spec}
      userId={userId}
      initialToday={today}
      initialHour={hour}
      dismissed={dismissed}
      share={share}
    />
  );
}

function TrackerView({
  initialEntries,
  initialFocus,
  initialPlans,
  initialSpec,
  userId,
  initialToday,
  initialHour,
  dismissed,
  share,
}: {
  initialEntries: Entries;
  initialFocus: Record<string, string>;
  initialPlans: Record<string, MonthPlan>;
  initialSpec: HabitSpec;
  userId: string;
  initialToday: string;
  initialHour: number;
  dismissed: string[];
  share: { title: string; url: string } | null;
}) {
  const [entries, setEntries] = useState(initialEntries);
  const [focuses, setFocuses] = useState(initialFocus);
  const [plans, setPlans] = useState(initialPlans);
  const [spec, setSpec] = useState(initialSpec);
  // The server drew Today for the day it believes it is where you are. On arrival the browser's own
  // calendar wins (see the mount effect), so a wrong guess is corrected, never trusted.
  const [today, setToday] = useState(initialToday);
  const [selected, setSelected] = useState(initialToday);
  const [tab, setTab] = useState<Tab>(share ? "shop" : "today");
  // what was shared in, until you leave Shop (so coming back doesn't fill the box a second time)
  const [draft, setDraft] = useState(share);
  // a Patterns row can send you to its section in Setup, already open
  const [setupFocus, setSetupFocus] = useState<string | null>(null);
  const [pulse, setPulse] = useState({ date: "", n: 0 });
  const toast = useRef<ToastApi>(null);
  // Debounced note saves fire later than the render that created them, so they read the
  // latest entries from here rather than from a stale closure.
  const entriesRef = useRef(entries);
  useEffect(() => {
    entriesRef.current = entries;
  }, [entries]);

  // Bumped when another device changed the day you're looking at, to remount its cards:
  // note boxes read their text only once, so they'd otherwise keep showing the old version.
  const [dayRev, setDayRev] = useState(0);
  // the hour of day, so Today can say "it's evening" without anyone refreshing
  const [hour, setHour] = useState(initialHour);
  // What you changed that the server hasn't confirmed: kept in this browser too (see lib/outbox), so it
  // outlives a dropped connection, a closed tab or a killed app. A refresh never overwrites these days.
  const box = useRef<Box>(emptyBox());
  const flushing = useRef(false);
  const pending = useRef(0); // saves in flight
  const mutations = useRef(0); // bumped on every local edit, so a slow refresh can tell it's stale
  const syncing = useRef(false);
  const lastSync = useRef(0);
  // the latest values, for handlers that outlive a single render (focus / visibility listeners)
  const todayRef = useRef(initialToday);
  const selectedRef = useRef(initialToday);
  const tabRef = useRef(tab);
  const specRef = useRef(spec);
  const focusRef = useRef(focuses);
  const plansRef = useRef(plans);
  useEffect(() => {
    todayRef.current = today;
    selectedRef.current = selected;
    tabRef.current = tab;
    specRef.current = spec;
    focusRef.current = focuses;
    plansRef.current = plans;
  }, [today, selected, tab, spec, focuses, plans]);

  useEffect(() => {
    const now = new Date();
    const t = localKey(now);
    if (t !== todayRef.current) {
      // the server's guess about your day was off (travel, a VPN): the browser knows better
      todayRef.current = t;
      selectedRef.current = t;
      setToday(t);
      setSelected(t);
    }
    setHour(now.getHours());
    rememberZone();
    lastSync.current = Date.now(); // the server just rendered this page: nothing to catch up on yet
    // opened by Share: take the shared words out of the address, so a reload doesn't repeat them
    if (window.location.search) window.history.replaceState(null, "", window.location.pathname);

    // once the page has settled, fetch the other tabs' code quietly so the first visit to each is instant
    const go = () => (["patterns", "journal", "shop", "setup"] as const).forEach(warm);
    let cancel = () => {};
    const timer = window.setTimeout(() => (cancel = whenIdle(go, 4000)), 2500);
    return () => {
      window.clearTimeout(timer);
      cancel();
    };
  }, []);

  /** Every change to what's on screen goes through here, so a refresh can tell the screen moved on. */
  function mutate(fn: (prev: Entries) => Entries) {
    mutations.current++;
    setEntries(fn);
  }

  // ---- staying current: the app outlives the day ----
  // Phones park tabs for hours. Coming back to the foreground rolls "today" forward and quietly
  // catches up with the server, so a stale screen never logs onto yesterday or overwrites what
  // another device recorded.

  /** The calendar day changed under an open app. */
  function roll(follow: boolean) {
    const cur = todayRef.current;
    const sel = selectedRef.current;
    if (!cur || !sel) return;
    const next = rollDay({ today: cur, selected: sel }, localKey(new Date()), follow);
    if (next.today === cur) return;
    todayRef.current = next.today;
    selectedRef.current = next.selected;
    setToday(next.today);
    setSelected(next.selected);
  }

  /** A line in the little pill at the bottom of the screen. */
  function say(kind: Status["kind"], text: string) {
    toast.current?.say(kind, text);
  }

  /** Record a change in the outbox (here and in this browser's storage). Reads storage first, so a second open tab's changes aren't lost. */
  function commit(change: (b: Box) => Box) {
    const next = change(readBox(userId) ?? box.current);
    box.current = next;
    writeBox(userId, next, isEmpty(next));
  }

  /** One send. Crosses the change off the outbox when the server confirms it, and only then. */
  async function deliver(op: Op): Promise<boolean> {
    pending.current++;
    let ok = false;
    try {
      ok = (await exec(op)).ok;
    } catch {
      ok = false;
    }
    pending.current--;
    if (ok) commit((b) => settle(b, op));
    return ok;
  }

  /**
   * Send everything that's waiting, oldest first, and stop at the first failure (still offline: no point
   * hammering). Returns "done" when it sent something and nothing is left, "still" when something is still
   * waiting, "idle" when there was nothing to do.
   */
  async function flushOutbox(): Promise<"done" | "still" | "idle"> {
    if (flushing.current || pending.current > 0) return "idle";
    const ops = pendingOps(readBox(userId) ?? box.current);
    if (ops.length === 0) return "idle";
    flushing.current = true;
    for (const op of ops) {
      if (!(await deliver(op))) {
        flushing.current = false;
        return "still";
      }
    }
    flushing.current = false;
    return "done";
  }

  /** Retry what's waiting and tell the person how it went (`loud`: also say so when it still can't be sent). */
  async function flushWaiting(loud: boolean) {
    const result = await flushOutbox();
    if (result === "done") say("saved", "Caught up. Everything is saved.");
    else if (result === "still" && loud) say("error", NOT_SAVED);
  }

  /** Fold a fresh read into the screen. The rules for what wins live in lib/sync; unsaved work is never thrown away. */
  function applySnapshot(snap: Snapshot) {
    const keep = waitingKeys(readBox(userId) ?? box.current);
    const local = entriesRef.current;
    const merged = mergeEntries(local, snap.entries, keep); // `local` itself when nothing changed
    const sel = selectedRef.current;
    if (sel && !sameEntry(local[sel], merged[sel])) setDayRev((r) => r + 1);
    if (merged !== local) setEntries(merged); // not `mutate`: this isn't a local edit
    setFocuses((prev) => {
      const next = { ...prev, ...snap.focuses };
      for (const k of keep) {
        if (k.startsWith("focus:")) {
          const month = k.slice("focus:".length);
          if (month in prev) next[month] = prev[month];
        }
      }
      return same(next, prev) ? prev : next;
    });
    setPlans((prev) => {
      const next = { ...prev, ...snap.plans };
      for (const k of keep) {
        if (k.startsWith("plan:")) {
          const month = k.slice("plan:".length);
          if (month in prev) next[month] = prev[month];
        }
      }
      return same(next, prev) ? prev : next;
    });
    // Setup keeps its own draft, so don't swap the spec out from under it
    if (snap.spec && tabRef.current !== "setup" && !same(snap.spec, specRef.current)) setSpec(snap.spec);
  }

  /** One refresh. Never throws: offline or a hiccup just means the next return to the app tries again. */
  async function syncOnce(days?: number) {
    let snap: Snapshot | null = null;
    let seen = 0;
    try {
      const result = await flushOutbox();
      if (result === "done") say("saved", "Caught up. Everything is saved.");
      if (pending.current > 0) return;
      seen = mutations.current;
      snap = await loadSnapshot(days);
    } catch {
      return;
    }
    // anything done on this screen while that read was out makes it stale: leave the screen alone
    if (!snap || mutations.current !== seen || pending.current > 0) return;
    lastSync.current = Date.now();
    try {
      applySnapshot(snap);
    } catch {
      // a read that doesn't fit what's on screen: ignore it
    }
  }

  /** Quietly catch up with the server. Coming back to the app asks for the recent weeks only; `force` (back online) rereads everything. */
  async function sync(force = false) {
    if (syncing.current) return;
    if (!force && Date.now() - lastSync.current < SYNC_GAP_MS) return;
    syncing.current = true;
    await syncOnce(force ? undefined : RECENT_DAYS);
    syncing.current = false;
  }

  function clock() {
    setHour(new Date().getHours()); // same value = no re-render
  }

  // a quiet retry each minute while something is waiting (a bad signal that's since come back)
  function retry() {
    if (syncing.current || isEmpty(readBox(userId) ?? box.current)) return;
    void flushWaiting(false);
  }

  const live = useRef({ roll, sync, clock, retry, flush: () => flushWaiting(true) });
  useEffect(() => {
    live.current = { roll, sync, clock, retry, flush: () => flushWaiting(true) };
  });
  useEffect(() => {
    const wake = () => {
      if (document.visibilityState !== "visible") return;
      live.current.roll(true); // coming back: if you were on "today", follow it to the new day
      live.current.clock();
      void live.current.sync();
    };
    const back = () => void live.current.sync(true);
    // while you're actively in the app past midnight, move "today" but leave you where you are
    const tick = () => {
      if (document.visibilityState !== "visible") return;
      live.current.roll(false);
      live.current.clock();
      live.current.retry();
    };
    document.addEventListener("visibilitychange", wake);
    window.addEventListener("focus", wake);
    window.addEventListener("pageshow", wake);
    window.addEventListener("online", back);
    const id = window.setInterval(tick, 60_000);
    return () => {
      document.removeEventListener("visibilitychange", wake);
      window.removeEventListener("focus", wake);
      window.removeEventListener("pageshow", wake);
      window.removeEventListener("online", back);
      window.clearInterval(id);
    };
  }, []);

  // changes from an earlier visit that never reached the server: show them again and send them now
  useEffect(() => {
    const waiting = readBox(userId);
    if (!waiting || isEmpty(waiting)) return;
    box.current = waiting;
    mutations.current++;
    setEntries((prev) => overlayEntries(prev, waiting));
    setFocuses((prev) => overlayFocus(prev, waiting));
    setPlans((prev) => overlayPlans(prev, waiting));
    if (selectedRef.current in waiting.days) setDayRev((r) => r + 1); // note boxes read their text once
    void live.current.flush();
  }, []);

  // ---- saving: UI updates first, server catches up in the background ----
  // Every save goes through here. It is written to the outbox *before* it is sent, so even a closed tab
  // or a dead connection can't lose it, and crossed off when the server confirms. Next dispatches Server
  // Actions one at a time per client, so saves reach the server in the order they were made.
  async function send(op: Op): Promise<boolean> {
    commit((b) => queue(b, op, Date.now()));
    return deliver(op);
  }

  async function persist(op: Op, okText = "Saved"): Promise<boolean> {
    say("saving", "Saving…");
    const ok = await send(op);
    if (ok) say("saved", okText);
    else say("error", NOT_SAVED);
    return ok;
  }

  // For typing-driven saves: never pop a toast, only speak up if it failed.
  async function persistQuiet(op: Op): Promise<boolean> {
    const ok = await send(op);
    if (!ok) say("error", NOT_SAVED);
    return ok;
  }

  const haptic = (ms: number) => typeof navigator !== "undefined" && navigator.vibrate?.(ms);

  /** Apply a change to the selected day; returns the toast text ("Day complete" beats "Saved"). */
  function change(next: Entry): string {
    const date = selected!;
    const then = specAt(spec, date);
    const total = dayTotal(then, date);
    const before = dayDone(entries[date], date, then);
    const after = dayDone(next, date, then);
    mutate((prev) => ({ ...prev, [date]: next }));
    setPulse((p) => ({ date, n: p.n + 1 }));
    return after === total && before < total ? "Day complete. Nice work." : "Saved";
  }

  function setField(key: string, value: string | number | string[] | undefined) {
    if (!selected) return;
    const cur = entries[selected] ?? EMPTY_ENTRY;
    const data: Data = { ...cur.data };
    if (value === undefined) delete data[key];
    else data[key] = value;
    const clean = pruneHidden(specAt(spec, selected), data); // also drops answers that no longer apply (e.g. gym type after "Skipped")
    // send only what this tap changed; the server merges it into the day's other answers
    const { set, remove } = diffData(cur.data, clean);
    const date = selected;
    haptic(8);
    const text = change({ ...cur, data: clean });
    persist({ kind: "data", date, set, remove }, text);
  }

  // "why did this slip" tags for a field live under a companion key in the same `data` blob —
  // this is just another field-level save, reusing setField's optimistic update + persist.
  function pickWhy(fieldKey: string, tags: string[]) {
    setField(whyKey(fieldKey), tags.length ? tags : undefined);
  }

  // Per-section freeform note — same storage trick as the reasons: a companion key on the
  // day's `data` blob. Quiet save (no toast) since notes are typed, not tapped.
  async function saveSectionNote(date: string, sectionId: string, text: string): Promise<boolean> {
    const cur = entriesRef.current[date] ?? EMPTY_ENTRY;
    const data: Data = { ...cur.data };
    const key = sectionNoteKey(sectionId);
    if (text.trim().length === 0) delete data[key];
    else data[key] = text;
    const clean = pruneHidden(specAt(spec, date), data);
    const { set, remove } = diffData(cur.data, clean);
    if (Object.keys(set).length === 0 && remove.length === 0) return true; // nothing actually changed
    mutate((prev) => ({ ...prev, [date]: { ...(prev[date] ?? EMPTY_ENTRY), data: clean } }));
    return persistQuiet({ kind: "data", date, set, remove });
  }

  /**
   * Change a few answers on any day (not just the one on screen), exactly as a tap on Today would: tidied the
   * same way, shown at once, and only what changed is sent. The Monday check-in and "away" both write this way.
   */
  function writeKeys(date: string, set: Data, remove: string[], okText?: string) {
    const cur = entriesRef.current[date] ?? EMPTY_ENTRY;
    const data: Data = { ...cur.data, ...set };
    for (const k of remove) delete data[k];
    const clean = pruneHidden(specAt(spec, date), data);
    const diff = diffData(cur.data, clean);
    if (Object.keys(diff.set).length === 0 && diff.remove.length === 0) return;
    mutate((prev) => ({ ...prev, [date]: { ...(prev[date] ?? EMPTY_ENTRY), data: clean } }));
    const op: Op = { kind: "data", date, set: diff.set, remove: diff.remove };
    if (okText) void persist(op, okText);
    else void persistQuiet(op);
  }

  /** Mark a day away (sick, travelling, resting), or with null, a normal day again. */
  function markAway(date: string, reason: AwayReason | null) {
    haptic(10);
    if (reason) writeKeys(date, { [AWAY_KEY]: reason }, [], `Away: ${awayLabel(reason).toLowerCase()}. Nothing counts that day.`);
    else writeKeys(date, {}, [AWAY_KEY], "Back to a normal day");
  }

  /** Save the reasons given for one question of the Monday check-in, where Today would have saved them. */
  function writeReason(step: Step, tags: string[]) {
    const w = reasonWrite(step, tags);
    haptic(6);
    if ("tags" in w) {
      patchDay(step.date, { tags: w.tags });
      void persistQuiet({ kind: "tags", date: step.date, tags: w.tags });
    } else writeKeys(step.date, w.set, w.remove);
  }

  async function saveSetup(next: HabitSpec): Promise<boolean> {
    // not remembered for re-sending: Setup keeps your draft on a failure, and the Save pill says so
    let saved: HabitSpec | undefined;
    pending.current++;
    let ok = false;
    try {
      const res = await saveSpec(next, localKey(new Date()));
      saved = res.spec;
      ok = res.ok;
    } catch {
      ok = false;
    }
    pending.current--;
    // what the server kept, history included, so Patterns judges the past by the rules it had
    if (ok) {
      setSpec(saved ?? next);
      // days that used an option you just removed keep it, as a day-only pick
      setEntries((prev) => normalizeEntries(saved ?? next, prev));
    }
    return ok;
  }

  // "Add for this day" on a choice: a pick that exists for the day you're on and nowhere else, so
  // a one-off ("Knee pain") never piles up in your options. The words travel inside the answer
  // itself. For something you want every day, add the option in Setup.
  function addCustom(field: FieldSpec, label: string) {
    if (!selected || (field.kind !== "single" && field.kind !== "multi")) return;
    const text = label.trim().replace(/\s+/g, " ").slice(0, CUSTOM_PICK_MAX);
    if (!text) return;
    // typing something you already have just picks it
    const same = field.options.find((o) => o.label.trim().toLowerCase() === text.toLowerCase());
    const id = same ? same.id : customId(text);
    if (field.kind === "single") return setField(field.key, id);
    const cur = ((entries[selected] ?? EMPTY_ENTRY).data[field.key] as string[] | undefined) ?? [];
    if (!cur.some((x) => x.toLowerCase() === id.toLowerCase())) setField(field.key, [...cur, id]);
  }

  function pickMood(mood: Mood) {
    if (!selected) return;
    const cur = entries[selected] ?? EMPTY_ENTRY;
    const next: Mood | null = cur.mood === mood ? null : mood;
    const date = selected;
    haptic(next === "bad" ? 24 : 12);
    const text = change({ ...cur, mood: next, tags: next === "bad" ? cur.tags : [] });
    persist({ kind: "mood", date, mood: next }, next ? (text === "Saved" ? CHEERS[next][Math.floor(Math.random() * CHEERS[next].length)] : text) : "Cleared");
  }

  // functional updates: these can fire late (debounce / unmount), so never trust a captured entry
  function patchDay(date: string, patch: Partial<Entry>) {
    mutate((prev) => ({ ...prev, [date]: { ...(prev[date] ?? EMPTY_ENTRY), ...patch } }));
  }

  function pickTags(tags: string[]) {
    if (!selected) return;
    const date = selected;
    haptic(6);
    patchDay(date, { tags });
    persist({ kind: "tags", date, tags }, "Reason saved");
  }

  function pickNote(note: string) {
    if (!selected) return Promise.resolve(false);
    const date = selected;
    patchDay(date, { note });
    return persistQuiet({ kind: "note", date, note });
  }

  function pickFocus(month: string, text: string) {
    setFocuses((prev) => ({ ...prev, [month]: text }));
    persistQuiet({ kind: "focus", month, text });
  }

  // a month's goals / review: same quiet save + retry-if-it-failed path as the focus line
  function pickPlan(month: string, plan: MonthPlan) {
    setPlans((prev) => ({ ...prev, [month]: plan }));
    persistQuiet({ kind: "plan", month, plan });
  }

  // FieldView skips re-drawing unless its own answer changed, which only works if the handlers it is
  // given keep the same identity (they still run the latest code when called).
  const onField = useStable(setField);
  const onWhy = useStable(pickWhy);
  const onCustom = useStable(addCustom);

  // Moving to another day is not urgent: the tap answers at once and the day follows
  const pickDay = (d: string) => startTransition(() => setSelected(d));

  const entry = selected ? (entries[selected] ?? EMPTY_ENTRY) : EMPTY_ENTRY;
  // an away day isn't judged: no "missed", no "why did this slip", and no progress to add up
  const away = awayOf(entry);
  const started = today ? (startedOn(entries, spec) ?? today) : "";
  // the selected day, as the rules stood then (schedule, what counts as a slip, goals, targets)
  const view = selected ? specAt(spec, selected) : spec;
  // the symbol in front of amounts in Shop: the one from your own Spending question
  const currency = currencyOf(spec);

  return (
    <div className="mx-auto w-full max-w-xl flex-1 px-4 pb-32 pt-6">
      <header className="mb-5 flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-semibold tracking-tight">
            {tab === "patterns"
              ? "Patterns"
              : tab === "journal"
                ? "Journal"
                : tab === "shop"
                  ? "Shop"
                  : tab === "setup"
                    ? "Setup"
                    : selected && selected === today
                      ? "Today"
                      : "Earlier"}
          </h1>
          <p className="truncate text-sm text-soft">
            {tab === "patterns"
              ? "What your days add up to"
              : tab === "journal"
                ? "What you've written, all in one place"
                : tab === "shop"
                  ? "What you actually need"
                  : tab === "setup"
                    ? "Make it yours"
                    : selected
                      ? prettyDate(selected)
                      : "\u00a0"}
          </p>
        </div>
        <ThemeToggle />
        {tab === "today" && selected && (away ? <AwayBadge reason={away} /> : <ProgressRing value={dayDone(entry, selected, view)} total={dayTotal(view, selected)} />)}
        <UserMenu size={48} />
      </header>

      {tab === "today" ? (
        <div className="flex flex-col gap-4">
          <DayStrip entries={entries} today={today} selected={selected} spec={spec} onSelect={pickDay} />
          {away && <AwayBanner key={`${selected}-${away}`} reason={away} isToday={selected === today} onPick={(r) => markAway(selected, r)} />}
          <Nudges
            spec={spec}
            entries={entries}
            today={today}
            selected={selected}
            hour={hour}
            dismissed={dismissed}
            onFill={pickDay}
            onAway={markAway}
            onReason={writeReason}
          />

          {view.sections.map((s, i) => {
            const scheduled = isScheduled(s, selected) && !away;
            const answered = sectionDone(entry, s);
            // a past day, planned, and nothing logged: worth a quiet "want to say why?" — never today,
            // since the day isn't over, and never before you started or before the section existed
            const missed = !answered && selected < today && isExpected(s, selected, started) && !away;
            const missTags = (entry.data[sectionMissKey(s.id)] as string[] | undefined) ?? [];
            // one "why did this slip?" per section, and never for a floor the day hasn't had time to reach
            const askKey = away ? undefined : whyPromptKey(view, s, entry.data, selected < today);
            return (
              <SectionCard
                // remount per day so local state (note text, amount input) resets, and again when
                // another device changed this day (dayRev), so the cards show the newer answers
                key={`${selected}-${dayRev}-${s.id}`}
                icon={s.icon}
                title={s.title}
                hint={scheduled ? s.hint : away ? "Away · log it if you did it" : "Not planned today · log it if you did it"}
                done={answered}
                muted={!scheduled && !answered}
                index={i}
                variant={TILE_VARIANTS[i % TILE_VARIANTS.length]}
              >
                {s.fields.map((f) => (
                  <FieldView
                    key={f.key}
                    field={f}
                    data={entry.data}
                    askWhy={askKey === f.key}
                    split={breakdownOf(view, f)}
                    onChange={onField}
                    onWhy={onWhy}
                    onCustom={onCustom}
                  />
                ))}
                {missed && (
                  <MissedNudge tags={missTags} onChange={(tags) => setField(sectionMissKey(s.id), tags.length ? tags : undefined)} />
                )}
                <NoteField
                  value={(entry.data[sectionNoteKey(s.id)] as string) ?? ""}
                  max={SECTION_NOTE_MAX}
                  onSave={(v) => saveSectionNote(selected, s.id, v)}
                  placeholder={
                    missed ? "What happened? Just for you." : `Anything worth remembering about ${s.title.toLowerCase()}.`
                  }
                  openLabel="Note"
                  closeLabel="Hide note"
                  filledLabel="Note"
                />
              </SectionCard>
            );
          })}

          <SectionCard
            // remount per day, same as the sections above — otherwise the note's local text
            // state sticks from whichever day was open first instead of following `entry`
            key={`${selected}-${dayRev}-day`}
            icon="sun"
            title="The day overall"
            hint="One honest verdict, plus a note if you want"
            done={entry.mood !== null}
            index={spec.sections.length}
            variant={TILE_VARIANTS[spec.sections.length % TILE_VARIANTS.length]}
          >
            <DayVerdict entry={entry} away={away} onMood={pickMood} onTags={pickTags} onNote={pickNote} onAway={(r) => markAway(selected, r)} />
          </SectionCard>
        </div>
      ) : tab === "patterns" ? (
        <Overview
          entries={entries}
          today={today}
          focuses={focuses}
          plans={plans}
          selected={selected}
          spec={spec}
          pulse={pulse}
          onPick={(d) => {
            setSelected(d);
            setTab("today");
            window.scrollTo({ top: 0, behavior: "smooth" });
          }}
          onFocus={pickFocus}
          onPlan={pickPlan}
          onSetup={(sectionId) => {
            setSetupFocus(sectionId);
            setTab("setup");
            window.scrollTo({ top: 0, behavior: "smooth" });
          }}
        />
      ) : tab === "journal" ? (
        <Journal
          entries={entries}
          spec={spec}
          onPick={(d) => {
            setSelected(d);
            setTab("today");
            window.scrollTo({ top: 0, behavior: "smooth" });
          }}
        />
      ) : tab === "shop" ? (
        <Shop
          today={today}
          currency={currency}
          draft={draft}
          getWaiting={() => readBox(userId) ?? box.current}
          onSend={(op, okText) => (okText ? persist(op, okText) : persistQuiet(op))}
        />
      ) : (
        <Setup spec={spec} onSave={saveSetup} openId={setupFocus} />
      )}

      <Toast api={toast} />

      <Nav
        tab={tab}
        onTab={(id) => {
          setSetupFocus(null);
          setDraft(null);
          setTab(id);
        }}
        onWarm={warm}
      />
    </div>
  );
}
