"use client";

import { useEffect, useRef, useState } from "react";
import { UserButton } from "@clerk/nextjs";
import { Activity, BookOpen, ListChecks, Settings2 } from "lucide-react";
import { saveData, saveFocus, saveNote, saveSpec, saveTags, setMood } from "@/app/actions";
import {
  dayDone,
  dayTotal,
  hasActivity,
  isExpected,
  isScheduled,
  pruneHidden,
  sectionDone,
  sectionMissKey,
  sectionNoteKey,
  SECTION_NOTE_MAX,
  startedOn,
  uniqueSlug,
  whyKey,
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
  initialSpec,
}: {
  initialEntries: Entries;
  initialFocus: Record<string, string>;
  initialSpec: HabitSpec;
}) {
  const [entries, setEntries] = useState(initialEntries);
  const [focuses, setFocuses] = useState(initialFocus);
  const [spec, setSpec] = useState(initialSpec);
  // "today" is the browser's calendar day, so it is only known after mount
  const [today, setToday] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [tab, setTab] = useState<"today" | "patterns" | "journal" | "setup">("today");
  const [pulse, setPulse] = useState({ date: "", n: 0 });
  const [status, setStatus] = useState<Status>({ kind: "idle", text: "", id: 0 });
  const clearTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Debounced note saves fire later than the render that created them, so they read the
  // latest entries from here rather than from a stale closure.
  const entriesRef = useRef(entries);
  useEffect(() => {
    entriesRef.current = entries;
  }, [entries]);

  useEffect(() => {
    const t = localKey(new Date());
    setToday(t);
    setSelected(t);
  }, []);

  // ---- saving: UI updates first, server catches up in the background ----
  function say(kind: Status["kind"], text: string) {
    if (clearTimer.current) clearTimeout(clearTimer.current);
    setStatus((s) => ({ kind, text, id: s.id + 1 }));
    if (kind === "saved") {
      clearTimer.current = setTimeout(() => setStatus((s) => ({ ...s, kind: "idle" })), 1600);
    }
  }

  async function persist(p: Promise<{ ok: boolean }>, okText = "Saved") {
    say("saving", "Saving…");
    let ok = false;
    try {
      ok = (await p).ok;
    } catch {
      ok = false;
    }
    if (ok) say("saved", okText);
    else say("error", "Not saved. Check your connection.");
  }

  // For typing-driven saves: never pop a toast, only speak up if it failed.
  async function persistQuiet(p: Promise<{ ok: boolean }>): Promise<boolean> {
    let ok = false;
    try {
      ok = (await p).ok;
    } catch {
      ok = false;
    }
    if (!ok) say("error", "Not saved. Check your connection.");
    return ok;
  }

  const haptic = (ms: number) => typeof navigator !== "undefined" && navigator.vibrate?.(ms);

  /** Apply a change to the selected day; returns the toast text ("Day complete" beats "Saved"). */
  function change(next: Entry): string {
    const date = selected!;
    const total = dayTotal(spec, date);
    const before = dayDone(entries[date], date, spec);
    const after = dayDone(next, date, spec);
    setEntries((prev) => ({ ...prev, [date]: next }));
    setPulse((p) => ({ date, n: p.n + 1 }));
    return after === total && before < total ? "Day complete. Nice work." : "Saved";
  }

  function setField(key: string, value: string | number | string[] | undefined) {
    if (!selected) return;
    const cur = entries[selected] ?? EMPTY_ENTRY;
    const data: Data = { ...cur.data };
    if (value === undefined) delete data[key];
    else data[key] = value;
    const clean = pruneHidden(spec, data); // also drops answers that no longer apply (e.g. gym type after "Skipped")
    haptic(8);
    const text = change({ ...cur, data: clean });
    persist(saveData(selected, clean), text);
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
    const clean = pruneHidden(spec, data);
    setEntries((prev) => ({ ...prev, [date]: { ...(prev[date] ?? EMPTY_ENTRY), data: clean } }));
    return persistQuiet(saveData(date, clean));
  }

  async function saveSetup(next: HabitSpec): Promise<boolean> {
    const ok = (await saveSpec(next)).ok;
    if (ok) setSpec(next);
    return ok;
  }

  // "Write your own" on a choice field: adds a real, permanent option to the spec (same as
  // adding one in Setup) and picks it for the day you're on, so you never need two taps for it.
  async function addOption(field: FieldSpec, label: string) {
    if (field.kind !== "single" && field.kind !== "multi") return;
    const clean = label.slice(0, 30);
    const used = new Set(field.options.map((o) => o.id));
    const id = uniqueSlug(clean, used, "option");
    const nextSpec: HabitSpec = {
      ...spec,
      sections: spec.sections.map((s) => ({
        ...s,
        fields: s.fields.map((f) =>
          f.key === field.key && f.kind === field.kind ? { ...f, options: [...f.options, { id, label: clean }] } : f,
        ),
      })),
    };
    const ok = await saveSetup(nextSpec);
    if (!ok || !selected) return;
    if (field.kind === "multi") {
      const cur = ((entries[selected] ?? EMPTY_ENTRY).data[field.key] as string[] | undefined) ?? [];
      setField(field.key, [...cur, id]);
    } else {
      setField(field.key, id);
    }
  }

  function pickMood(mood: Mood) {
    if (!selected) return;
    const cur = entries[selected] ?? EMPTY_ENTRY;
    const next: Mood | null = cur.mood === mood ? null : mood;
    haptic(next === "bad" ? 24 : 12);
    const text = change({ ...cur, mood: next, tags: next === "bad" ? cur.tags : [] });
    persist(setMood(selected, next), next ? (text === "Saved" ? CHEERS[next][Math.floor(Math.random() * CHEERS[next].length)] : text) : "Cleared");
  }

  // functional updates: these can fire late (debounce / unmount), so never trust a captured entry
  function patchDay(date: string, patch: Partial<Entry>) {
    setEntries((prev) => ({ ...prev, [date]: { ...(prev[date] ?? EMPTY_ENTRY), ...patch } }));
  }

  function pickTags(tags: string[]) {
    if (!selected) return;
    haptic(6);
    patchDay(selected, { tags });
    persist(saveTags(selected, tags), "Reason saved");
  }

  function pickNote(note: string) {
    if (!selected) return Promise.resolve(false);
    patchDay(selected, { note });
    return persistQuiet(saveNote(selected, note));
  }

  function pickFocus(month: string, text: string) {
    setFocuses((prev) => ({ ...prev, [month]: text }));
    persistQuiet(saveFocus(month, text));
  }

  const entry = selected ? (entries[selected] ?? EMPTY_ENTRY) : EMPTY_ENTRY;
  const started = today ? (startedOn(entries, spec) ?? today) : "";

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
          <ProgressRing value={dayDone(entry, selected, spec)} total={dayTotal(spec, selected)} />
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

          {spec.sections.map((s, i) => {
            const scheduled = isScheduled(s, selected);
            const answered = sectionDone(entry, s);
            // a past day, planned, and nothing logged: worth a quiet "want to say why?" — never today,
            // since the day isn't over, and never before you started or before the section existed
            const missed = !answered && selected < today && isExpected(s, selected, started);
            const missTags = (entry.data[sectionMissKey(s.id)] as string[] | undefined) ?? [];
            return (
              <SectionCard
                // remount per day so local state (note text, amount input) resets
                key={`${selected}-${s.id}`}
                icon={s.icon}
                title={s.title}
                hint={scheduled ? s.hint : "Not planned today · log it if you did it"}
                done={answered}
                muted={!scheduled && !answered}
                index={i}
                variant={TILE_VARIANTS[i % TILE_VARIANTS.length]}
              >
                {s.fields.map((f) => (
                  <FieldView key={f.key} field={f} data={entry.data} spec={spec} onChange={setField} onWhy={pickWhy} onAddOption={addOption} />
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
            key={`${selected}-day`}
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
          focus={focuses[today.slice(0, 7)] ?? ""}
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
        <Setup spec={spec} onSave={saveSetup} />
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
            onClick={() => setTab(id)}
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
