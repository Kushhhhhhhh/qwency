"use client";

import { useEffect, useRef, useState } from "react";
import { UserButton } from "@clerk/nextjs";
import { Activity, BookOpen, ListChecks, Settings2 } from "lucide-react";
import { loadSnapshot, patchData, saveFocus, saveNote, savePlan, saveSpec, saveTags, setMood } from "@/app/actions";
import { EMPTY_PLAN, type MonthPlan } from "@/lib/goals";
import {
  breakdownOf,
  customId,
  CUSTOM_PICK_MAX,
  dayDone,
  dayTotal,
  diffData,
  hasActivity,
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
  addDays,
  localKey,
  prettyDate,
  type Entries,
  type Entry,
  type Mood,
} from "@/lib/tracker";
import { canon, mergeEntries, rollDay, sameEntry } from "@/lib/sync";
import { DayStrip } from "./day-strip";
import { FieldView } from "./field-view";
import { Journal } from "./journal";
import { MissedNudge } from "./missed-nudge";
import { NoteField } from "./note-field";
import { Overview } from "./overview";
import { DayVerdict, SectionCard, TILE_VARIANTS } from "./section-card";
import { Setup } from "./setup";
import { ProgressRing } from "./ui";

const CHEERS: Record<Mood, string[]> = {
  good: ["Locked in.", "Good day, logged.", "Stacking wins."],
  meh: ["Logged. Honest beats perfect.", "Noted."],
  bad: ["Logged. Now name the cause.", "Rough days are data too."],
};

type Status = { kind: "idle" | "saving" | "saved" | "error"; text: string; id: number };

// Which piece of a day a save was for, so a failed one can be re-sent on its own later.
type Part = "data" | "mood" | "tags" | "note" | "focus" | "plan";
const PART_ORDER: Part[] = ["data", "mood", "tags", "note", "focus", "plan"];
const SYNC_GAP_MS = 15_000; // returning to the app twice in a row shouldn't hit the server twice

function streakOf(entries: Entries, today: string, spec: HabitSpec) {
  const logged = (d: string) => hasActivity(entries[d], spec);
  let day = logged(today) ? today : addDays(today, -1);
  let n = 0;
  while (logged(day)) {
    n++;
    day = addDays(day, -1);
  }
  return n;
}

export function Tracker({
  initialEntries,
  initialFocus,
  initialPlans,
  initialSpec,
}: {
  initialEntries: Entries;
  initialFocus: Record<string, string>;
  initialPlans: Record<string, MonthPlan>;
  initialSpec: HabitSpec;
}) {
  const [entries, setEntries] = useState(initialEntries);
  const [focuses, setFocuses] = useState(initialFocus);
  const [plans, setPlans] = useState(initialPlans);
  const [spec, setSpec] = useState(initialSpec);
  // "today" is the browser's calendar day, so it is only known after mount
  const [today, setToday] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [tab, setTab] = useState<"today" | "patterns" | "journal" | "setup">("today");
  // a Patterns row can send you to its section in Setup, already open
  const [setupFocus, setSetupFocus] = useState<string | null>(null);
  const [pulse, setPulse] = useState({ date: "", n: 0 });
  const [status, setStatus] = useState<Status>({ kind: "idle", text: "", id: 0 });
  const clearTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Debounced note saves fire later than the render that created them, so they read the
  // latest entries from here rather than from a stale closure.
  const entriesRef = useRef(entries);
  useEffect(() => {
    entriesRef.current = entries;
  }, [entries]);

  // Bumped when another device changed the day you're looking at, to remount its cards:
  // note boxes read their text only once, so they'd otherwise keep showing the old version.
  const [dayRev, setDayRev] = useState(0);
  // Saves that never reached the server ("date|part"). A refresh must never overwrite a day
  // whose only up-to-date copy is on this screen.
  const failed = useRef(new Set<string>());
  const pending = useRef(0); // saves in flight
  const mutations = useRef(0); // bumped on every local edit, so a slow refresh can tell it's stale
  const syncing = useRef(false);
  const lastSync = useRef(0);
  // the latest values, for handlers that outlive a single render (focus / visibility listeners)
  const todayRef = useRef<string | null>(null);
  const selectedRef = useRef<string | null>(null);
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
    const t = localKey(new Date());
    setToday(t);
    setSelected(t);
    lastSync.current = Date.now(); // the server just rendered this page: nothing to catch up on yet
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
      } finally {
        pending.current--;
      }
      if (!ok) return; // still offline: stop here instead of hammering
      failed.current.delete(fk);
    }
  }

  /** Quietly fold the server's current state into the screen. Never throws away unsaved work. */
  async function sync(force = false) {
    if (syncing.current) return;
    if (!force && Date.now() - lastSync.current < SYNC_GAP_MS) return;
    syncing.current = true;
    try {
      await flushFailed();
      if (pending.current > 0) return;
      const seen = mutations.current;
      const snap = await loadSnapshot();
      // anything done on this screen while that read was out makes it stale: leave the screen alone
      if (!snap || mutations.current !== seen || pending.current > 0) return;
      lastSync.current = Date.now();

      const keep = new Set([...failed.current].map((f) => f.split("|")[0]));
      const local = entriesRef.current;
      const merged = mergeEntries(local, snap.entries, keep);
      const sel = selectedRef.current;
      if (sel && !sameEntry(local[sel], merged[sel])) setDayRev((r) => r + 1);
      if (canon(merged) !== canon(local)) setEntries(merged); // not `mutate`: this isn't a local edit
      setFocuses((prev) => {
        const next = { ...prev, ...snap.focuses };
        for (const k of keep) {
          if (k.startsWith("focus:")) {
            const month = k.slice("focus:".length);
            if (month in prev) next[month] = prev[month];
          }
        }
        return canon(next) === canon(prev) ? prev : next;
      });
      setPlans((prev) => {
        const next = { ...prev, ...snap.plans };
        for (const k of keep) {
          if (k.startsWith("plan:")) {
            const month = k.slice("plan:".length);
            if (month in prev) next[month] = prev[month];
          }
        }
        return canon(next) === canon(prev) ? prev : next;
      });
      // Setup keeps its own draft, so don't swap the spec out from under it
      if (tabRef.current !== "setup" && canon(snap.spec) !== canon(specRef.current)) setSpec(snap.spec);
    } catch {
      // offline or a hiccup: stay quiet, the next return to the app tries again
    } finally {
      syncing.current = false;
    }
  }

  const live = useRef({ roll, sync });
  useEffect(() => {
    live.current = { roll, sync };
  });
  useEffect(() => {
    const wake = () => {
      if (document.visibilityState !== "visible") return;
      live.current.roll(true); // coming back: if you were on "today", follow it to the new day
      void live.current.sync();
    };
    const back = () => void live.current.sync(true);
    // while you're actively in the app past midnight, move "today" but leave you where you are
    const tick = () => {
      if (document.visibilityState === "visible") live.current.roll(false);
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
    if (clearTimer.current) clearTimeout(clearTimer.current);
    setStatus((s) => ({ kind, text, id: s.id + 1 }));
    if (kind === "saved") {
      clearTimer.current = setTimeout(() => setStatus((s) => ({ ...s, kind: "idle" })), 1600);
    }
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
    } finally {
      pending.current--;
    }
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
                    : " "}
          </p>
        </div>
        {tab === "today" && selected && (
          <ProgressRing value={dayDone(entry, selected, view)} total={dayTotal(view, selected)} />
        )}
        <UserButton
          appearance={{
            elements: {
              avatarBox: { width: 48, height: 48, boxShadow: "0 0 0 2px rgb(80 78 118 / 0.15)" },
            },
          }}
        />
      </header>

      {!today || !selected ? (
        <div className="card p-10 text-center text-sm text-ink/60">Loading…</div>
      ) : tab === "today" ? (
        <div className="flex flex-col gap-4">
          <DayStrip entries={entries} today={today} selected={selected} spec={spec} onSelect={setSelected} />

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
                    onChange={setField}
                    onWhy={pickWhy}
                    onCustom={addCustom}
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
          streak={streakOf(entries, today, spec)}
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

      {status.kind !== "idle" && (
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
      )}

      <nav className="fixed bottom-5 left-1/2 z-10 flex -translate-x-1/2 gap-0.5 rounded-full border border-ink/10 bg-white/80 p-1 shadow-xl shadow-ink/15 backdrop-blur-md">
        {(
          [
            ["today", "Today", ListChecks],
            ["patterns", "Patterns", Activity],
            ["journal", "Journal", BookOpen],
            ["setup", "Setup", Settings2],
          ] as const
        ).map(([id, label, Icon]) => (
          <button
            key={id}
            type="button"
            onClick={() => {
              setSetupFocus(null);
              setTab(id);
            }}
            aria-current={tab === id}
            aria-label={label}
            className={`flex items-center gap-1.5 rounded-full px-3.5 py-2.5 text-sm font-medium transition-all duration-200 active:scale-95 sm:px-4 ${
              tab === id ? "bg-ink text-cream" : "text-ink/60 hover:text-ink"
            }`}
          >
            <Icon size={17} strokeWidth={2} />
            <span className="hidden sm:inline">{label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}
