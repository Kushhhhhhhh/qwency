"use client";

import { Suspense, startTransition, use, useEffect, useImperativeHandle, useRef, useState, type Ref } from "react";
import dynamic from "next/dynamic";
import { loadSnapshot, patchData, saveFocus, saveNote, savePlan, saveSpec, saveTags, setMood } from "@/app/actions";
import { EMPTY_PLAN, type MonthPlan } from "@/lib/goals";
import {
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
  type Data,
  type FieldSpec,
  type HabitSpec,
} from "@/lib/spec";
import {
  EMPTY_ENTRY,
  localKey,
  prettyDate,
  type Entries,
  type Entry,
  type Mood,
} from "@/lib/tracker";
import { TZ_COOKIE } from "@/lib/clock";
import { whenIdle } from "@/lib/idle";
import { useStable } from "@/lib/use-stable";
import { RECENT_DAYS, type Snapshot } from "@/lib/snapshot";
import { mergeEntries, rollDay, same, sameEntry } from "@/lib/sync";
import { DayStrip } from "./day-strip";
import { FieldView } from "./field-view";
import { Nudges } from "./nudge";
import { MissedNudge } from "./missed-nudge";
import { NoteField } from "./note-field";
import { DayVerdict, SectionCard, TILE_VARIANTS } from "./section-card";
import { Nav, TabSkeleton, TodayShell, type Tab } from "./shell";
import { ProgressRing } from "./ui";
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
  setup: () => import("./setup"),
};
const Overview = dynamic(() => loaders.patterns().then((m) => m.Overview), { loading: () => <TabSkeleton /> });
const Journal = dynamic(() => loaders.journal().then((m) => m.Journal), { loading: () => <TabSkeleton /> });
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
      className={`toast-in fixed bottom-24 left-1/2 z-20 -translate-x-1/2 whitespace-nowrap rounded-full px-4 py-2 text-sm font-medium shadow-lg shadow-ink/20 ${
        status.kind === "error"
          ? "bg-bad text-[#2b2946]"
          : status.kind === "saved"
            ? "bg-ink text-cream"
            : "bg-white text-ink"
      }`}
    >
      {status.text}
    </div>
  );
}

// Which piece of a day a save was for, so a failed one can be re-sent on its own later.
type Part = "data" | "mood" | "tags" | "note" | "focus" | "plan";
const PART_ORDER: Part[] = ["data", "mood", "tags", "note", "focus", "plan"];
const SYNC_GAP_MS = 15_000; // returning to the app twice in a row shouldn't hit the server twice

/**
 * The page hands over the database read as a promise instead of waiting for it. The heading, date
 * and shape of Today are on screen straight away; your days drop into the same places when they arrive.
 */
export function Tracker({
  snapshot,
  today,
  hour,
  dismissed,
}: {
  snapshot: Promise<Snapshot>;
  today: string;
  hour: number;
  dismissed: string[];
}) {
  return (
    <Suspense fallback={<TodayShell dateText={prettyDate(today)} />}>
      <TrackerLoaded snapshot={snapshot} today={today} hour={hour} dismissed={dismissed} />
    </Suspense>
  );
}

function TrackerLoaded({ snapshot, today, hour, dismissed }: { snapshot: Promise<Snapshot>; today: string; hour: number; dismissed: string[] }) {
  const snap = use(snapshot);
  if (!snap.spec) return <Welcome />; // a new account picks what to track before anything else
  return (
    <TrackerView
      initialEntries={snap.entries}
      initialFocus={snap.focuses}
      initialPlans={snap.plans}
      initialSpec={snap.spec}
      initialToday={today}
      initialHour={hour}
      dismissed={dismissed}
    />
  );
}

function TrackerView({
  initialEntries,
  initialFocus,
  initialPlans,
  initialSpec,
  initialToday,
  initialHour,
  dismissed,
}: {
  initialEntries: Entries;
  initialFocus: Record<string, string>;
  initialPlans: Record<string, MonthPlan>;
  initialSpec: HabitSpec;
  initialToday: string;
  initialHour: number;
  dismissed: string[];
}) {
  const [entries, setEntries] = useState(initialEntries);
  const [focuses, setFocuses] = useState(initialFocus);
  const [plans, setPlans] = useState(initialPlans);
  const [spec, setSpec] = useState(initialSpec);
  // The server drew Today for the day it believes it is where you are. On arrival the browser's own
  // calendar wins (see the mount effect), so a wrong guess is corrected, never trusted.
  const [today, setToday] = useState(initialToday);
  const [selected, setSelected] = useState(initialToday);
  const [tab, setTab] = useState<"today" | "patterns" | "journal" | "setup">("today");
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
  // Saves that never reached the server ("date|part"). A refresh must never overwrite a day
  // whose only up-to-date copy is on this screen.
  const failed = useRef(new Set<string>());
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

    // once the page has settled, fetch the other tabs' code quietly so the first visit to each is instant
    const go = () => (["patterns", "journal", "setup"] as const).forEach(warm);
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

  /** Re-send anything that failed earlier (e.g. you were offline), oldest kind first. */
  async function flushFailed() {
    const todo = [...failed.current].sort(
      (a, b) => PART_ORDER.indexOf(a.split("|")[1] as Part) - PART_ORDER.indexOf(b.split("|")[1] as Part),
    );
    for (const fk of todo) {
      const [key, part] = fk.split("|") as [string, Part];
      const e = entriesRef.current[key];
      let job: (() => Promise<{ ok: boolean }>) | null = null;
      if (part === "focus") {
        const month = key.slice("focus:".length);
        job = () => saveFocus(month, focusRef.current[month] ?? "");
      } else if (part === "plan") {
        const month = key.slice("plan:".length);
        job = () => savePlan(month, plansRef.current[month] ?? EMPTY_PLAN);
      } else if (e && part === "data") job = () => patchData(key, e.data, []); // all this screen knows about the day
      else if (e && part === "mood") job = () => setMood(key, e.mood);
      else if (e && part === "tags") job = () => saveTags(key, e.tags);
      else if (e && part === "note") job = () => saveNote(key, e.note);
      if (!job) {
        failed.current.delete(fk);
        continue;
      }
      pending.current++;
      let ok = false;
      try {
        ok = (await job()).ok;
      } catch {
        ok = false;
      }
      pending.current--;
      if (!ok) return; // still offline: stop here instead of hammering
      failed.current.delete(fk);
    }
  }

  /** Fold a fresh read into the screen. The rules for what wins live in lib/sync; unsaved work is never thrown away. */
  function applySnapshot(snap: Snapshot) {
    const keep = new Set([...failed.current].map((f) => f.split("|")[0]));
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
      await flushFailed();
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

  const live = useRef({ roll, sync, clock });
  useEffect(() => {
    live.current = { roll, sync, clock };
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

  // ---- saving: UI updates first, server catches up in the background ----
  function say(kind: Status["kind"], text: string) {
    toast.current?.say(kind, text);
  }

  // Every save goes through here. It counts what's in flight (a refresh waits for it) and
  // remembers what failed, so it can be re-sent instead of silently lost. Next dispatches Server
  // Actions one at a time per client, so saves reach the server in the order they were made.
  async function send(key: string, part: Part | null, job: () => Promise<{ ok: boolean }>): Promise<boolean> {
    pending.current++;
    let ok = false;
    try {
      ok = (await job()).ok;
    } catch {
      ok = false;
    }
    pending.current--;
    if (!ok && part) failed.current.add(`${key}|${part}`);
    return ok;
  }

  async function persist(key: string, part: Part, job: () => Promise<{ ok: boolean }>, okText = "Saved") {
    say("saving", "Saving…");
    if (await send(key, part, job)) say("saved", okText);
    else say("error", "Not saved. Check your connection.");
  }

  // For typing-driven saves: never pop a toast, only speak up if it failed.
  async function persistQuiet(key: string, part: Part, job: () => Promise<{ ok: boolean }>): Promise<boolean> {
    const ok = await send(key, part, job);
    if (!ok) say("error", "Not saved. Check your connection.");
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
    persist(date, "data", () => patchData(date, set, remove), text);
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
    return persistQuiet(date, "data", () => patchData(date, set, remove));
  }

  async function saveSetup(next: HabitSpec): Promise<boolean> {
    // not remembered for re-sending: Setup keeps your draft on a failure, and the Save pill says so
    let saved: HabitSpec | undefined;
    const ok = await send("spec", null, async () => {
      const res = await saveSpec(next, localKey(new Date()));
      saved = res.spec;
      return res;
    });
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
    persist(date, "mood", () => setMood(date, next), next ? (text === "Saved" ? CHEERS[next][Math.floor(Math.random() * CHEERS[next].length)] : text) : "Cleared");
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
    persist(date, "tags", () => saveTags(date, tags), "Reason saved");
  }

  function pickNote(note: string) {
    if (!selected) return Promise.resolve(false);
    const date = selected;
    patchDay(date, { note });
    return persistQuiet(date, "note", () => saveNote(date, note));
  }

  function pickFocus(month: string, text: string) {
    setFocuses((prev) => ({ ...prev, [month]: text }));
    persistQuiet(`focus:${month}`, "focus", () => saveFocus(month, text));
  }

  // a month's goals / review: same quiet save + retry-if-it-failed path as the focus line
  function pickPlan(month: string, plan: MonthPlan) {
    setPlans((prev) => ({ ...prev, [month]: plan }));
    persistQuiet(`plan:${month}`, "plan", () => savePlan(month, plan));
  }

  // FieldView skips re-drawing unless its own answer changed, which only works if the handlers it is
  // given keep the same identity (they still run the latest code when called).
  const onField = useStable(setField);
  const onWhy = useStable(pickWhy);
  const onCustom = useStable(addCustom);

  // Moving to another day is not urgent: the tap answers at once and the day follows
  const pickDay = (d: string) => startTransition(() => setSelected(d));

  const entry = selected ? (entries[selected] ?? EMPTY_ENTRY) : EMPTY_ENTRY;
  const started = today ? (startedOn(entries, spec) ?? today) : "";
  // the selected day, as the rules stood then (schedule, what counts as a slip, goals, targets)
  const view = selected ? specAt(spec, selected) : spec;

  return (
    <div className="mx-auto w-full max-w-xl flex-1 px-4 pb-32 pt-6">
      <header className="mb-5 flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-semibold tracking-tight">
            {tab === "patterns"
              ? "Patterns"
              : tab === "journal"
                ? "Journal"
                : tab === "setup"
                  ? "Setup"
                  : selected && selected === today
                    ? "Today"
                    : "Earlier"}
          </h1>
          <p className="truncate text-sm text-ink/60">
            {tab === "patterns"
              ? "What your days add up to"
              : tab === "journal"
                ? "What you've written, all in one place"
                : tab === "setup"
                  ? "Make it yours"
                  : selected
                    ? prettyDate(selected)
                    : " "}
          </p>
        </div>
        {tab === "today" && selected && (
          <ProgressRing value={dayDone(entry, selected, view)} total={dayTotal(view, selected)} />
        )}
        <UserMenu size={48} />
      </header>

      {tab === "today" ? (
        <div className="flex flex-col gap-4">
          <DayStrip entries={entries} today={today} selected={selected} spec={spec} onSelect={pickDay} />
          <Nudges spec={spec} entries={entries} today={today} selected={selected} hour={hour} dismissed={dismissed} onFill={pickDay} />

          {view.sections.map((s, i) => {
            const scheduled = isScheduled(s, selected);
            const answered = sectionDone(entry, s);
            // a past day, planned, and nothing logged: worth a quiet "want to say why?" — never today,
            // since the day isn't over, and never before you started or before the section existed
            const missed = !answered && selected < today && isExpected(s, selected, started);
            const missTags = (entry.data[sectionMissKey(s.id)] as string[] | undefined) ?? [];
            // one "why did this slip?" per section, and never for a floor the day hasn't had time to reach
            const askKey = whyPromptKey(view, s, entry.data, selected < today);
            return (
              <SectionCard
                // remount per day so local state (note text, amount input) resets, and again when
                // another device changed this day (dayRev), so the cards show the newer answers
                key={`${selected}-${dayRev}-${s.id}`}
                icon={s.icon}
                title={s.title}
                hint={scheduled ? s.hint : "Not planned today · log it if you did it"}
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
            <DayVerdict entry={entry} onMood={pickMood} onTags={pickTags} onNote={pickNote} />
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
      ) : (
        <Setup spec={spec} onSave={saveSetup} openId={setupFocus} />
      )}

      <Toast api={toast} />

      <Nav
        tab={tab}
        onTab={(id) => {
          setSetupFocus(null);
          setTab(id);
        }}
        onWarm={warm}
      />
    </div>
  );
}
