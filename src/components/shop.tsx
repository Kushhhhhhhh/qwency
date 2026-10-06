"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowDown, ArrowUp, Check, ChevronLeft, ChevronRight, ExternalLink, Plus, Trash2 } from "lucide-react";
import { loadShop, previewLink } from "@/app/actions";
import { listTitles } from "@/lib/insights";
import { overlayBudgets, overlayItems, type Box, type Op } from "@/lib/outbox";
import {
  carryOver,
  brief,
  hostOf,
  moneyFor,
  newItemId,
  nextSort,
  nudge,
  pocketView,
  receipts,
  sanitizeItem,
  SHOP_ICON_IDS,
  skipped,
  splitLink,
  titleFromUrl,
  TITLE_MAX,
  URL_MAX,
  windowShelf,
  type Item,
  type Kind,
  type Pocket,
  type Shelf,
} from "@/lib/shop";
import { shopIcon, shopIconLabel } from "@/lib/shop-icons";
import { suggestIcon } from "@/lib/shop-suggest";
import { addMonths, monthName, monthOf, prettyDate } from "@/lib/tracker";
import { Fold } from "./fold";
import { TabSkeleton } from "./shell";
import { Chip } from "./ui";

// Shop: a monthly pocket (the suitcase) and the things you actually need. Three shelves: This month
// (planned, counted against the pocket), Window (saved to look at later, never counted) and Bought.
// Every change goes through `onSend`, which is the app's outbox, so nothing is lost offline.

type View = "month" | "window" | "bought";

type Props = {
  /** today, in your own calendar (YYYY-MM-DD) */
  today: string;
  /** the symbol in front of amounts, from your Spending setup */
  currency: string;
  /** what's waiting to be saved, so a fresh load still shows your unsent changes */
  getWaiting: () => Box;
  /** queue + send one change; resolves with whether the server confirmed it */
  onSend: (op: Op, okText?: string) => Promise<boolean>;
  /** something shared into the app from a shop's own app (title and link), to start an item from */
  draft?: { title: string; url: string } | null;
  /** start from data already in hand instead of reading it from the server (previews and tests) */
  seed?: { items: Item[]; budgets: Record<string, number>; view?: View; open?: string };
};

type Load = { status: "loading" | "ready" | "setup" | "error"; items: Item[]; budgets: Record<string, number>; loaded: Record<string, true> };

const PASTELS = ["bg-tile-1", "bg-tile-2", "bg-tile-3"];
const FIRST = -12; // how far back / ahead you can look, in months
const LAST = 6;

/** "1,299" / "1299.5" / "" -> a number, null for empty, undefined when it isn't an amount */
function parseMoney(text: string): number | null | undefined {
  const t = text.replace(/[,\s]/g, "").replace(/^[^\d.]+/, "");
  if (t === "") return null;
  const n = Number(t);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : undefined;
}

const inScope = (i: Item, month: string) => i.month === month || i.shelf === "window" || (i.shelf === "month" && i.month < month);

export function Shop({ today, currency, getWaiting, onSend, draft, seed }: Props) {
  const thisMonth = monthOf(today);
  const money = moneyFor(currency);
  const [month, setMonth] = useState(thisMonth);
  const [view, setView] = useState<View>(seed?.view ?? "month");
  const [load, setLoad] = useState<Load>(() =>
    seed ? { status: "ready", items: seed.items, budgets: seed.budgets, loaded: { [thisMonth]: true } } : { status: "loading", items: [], budgets: {}, loaded: {} },
  );
  const [openId, setOpenId] = useState<string | null>(seed?.open ?? null);
  const [tries, setTries] = useState(0);
  // links being read, and ones that couldn't be (so the card can say so instead of staying quiet)
  const [reading, setReading] = useState<Record<string, "reading" | "failed">>({});
  const latest = useRef<Item[]>([]);

  // read this month's things from the server, then lay your unsent changes over them
  useEffect(() => {
    if (seed) {
      setLoad((p) => (p.loaded[month] ? p : { ...p, loaded: { ...p.loaded, [month]: true } }));
      return;
    }
    let alive = true;
    loadShop(month)
      .then((res) => {
        if (!alive) return;
        if (!res.ok) {
          setLoad((p) => ({ ...p, status: res.setup ? "setup" : p.loaded[month] ? "ready" : "error" }));
          return;
        }
        const waiting = getWaiting();
        setLoad((p) => ({
          status: "ready",
          items: overlayItems([...p.items.filter((i) => !inScope(i, month)), ...res.items], waiting),
          budgets: overlayBudgets({ ...p.budgets, ...res.budgets }, waiting),
          loaded: { ...p.loaded, [month]: true },
        }));
      })
      .catch(() => {
        if (alive) setLoad((p) => ({ ...p, status: p.loaded[month] ? "ready" : "error" }));
      });
    return () => {
      alive = false;
    };
  }, [month, tries]);

  const ready = load.status === "ready" && load.loaded[month] === true;
  const items = load.items;
  useEffect(() => {
    latest.current = items;
  });
  const budget = load.budgets[month] ?? null;
  const pocket = pocketView(budget, items, month, money);

  // ---- changes: show them at once, then hand them to the outbox ----
  function put(next: Item, okText?: string) {
    const clean = sanitizeItem(next);
    if (!clean) return;
    setLoad((p) => ({ ...p, items: p.items.some((i) => i.id === clean.id) ? p.items.map((i) => (i.id === clean.id ? clean : i)) : [...p.items, clean] }));
    void onSend({ kind: "item", item: clean }, okText);
  }
  function remove(item: Item) {
    setLoad((p) => ({ ...p, items: p.items.filter((i) => i.id !== item.id) }));
    if (openId === item.id) setOpenId(null);
    void onSend({ kind: "itemRemove", id: item.id }, "Removed");
  }
  function setBudget(amount: number | null) {
    setLoad((p) => {
      const budgets = { ...p.budgets };
      if (amount === null) delete budgets[month];
      else budgets[month] = amount;
      return { ...p, budgets };
    });
    void onSend({ kind: "budget", month, amount });
  }
  function move(item: Item, dir: -1 | 1) {
    for (const changed of nudge(items, item.id, dir)) put(changed);
  }

  /**
   * Read the page behind a link and fill in what it says, but only what you haven't: your own title and
   * your own price always win. A page that won't be read just leaves the card as it is, with a note.
   */
  function autofill(item: Item, hadTitle: boolean) {
    if (!item.url) return;
    setReading((r) => ({ ...r, [item.id]: "reading" }));
    previewLink(item.url)
      .then((res) => {
        const cur = latest.current.find((i) => i.id === item.id);
        setReading((r) => {
          const next = { ...r };
          delete next[item.id];
          return res.ok || !cur ? next : { ...next, [item.id]: "failed" };
        });
        if (!res.ok || !cur) return;
        const patch: Partial<Item> = {};
        if (!hadTitle && res.title && cur.title === item.title) {
          patch.title = res.title;
          if (cur.icon === "bag") patch.icon = suggestIcon(res.title);
        }
        if (cur.price === null && res.price !== null) patch.price = res.price;
        if (Object.keys(patch).length > 0) put({ ...cur, ...patch });
      })
      .catch(() => setReading((r) => ({ ...r, [item.id]: "failed" })));
  }

  /** a new thing from whatever was typed or pasted */
  function addFromText(text: string) {
    const { url, rest } = splitLink(text);
    // only a link: the name is in the address itself (works even for shops that won't let us read their page)
    const title = rest || (url ? titleFromUrl(url) || hostOf(url) : "");
    const shelf: Shelf = view === "window" ? "window" : "month";
    const mates = items.filter((i) => i.shelf === shelf && (shelf === "window" || i.month === month));
    const item = sanitizeItem({
      id: newItemId(),
      month,
      title,
      price: null,
      url,
      note: "",
      icon: suggestIcon(title),
      kind: "need",
      shelf,
      boughtPrice: null,
      boughtOn: null,
      sort: nextSort(mates),
    });
    if (!item) return;
    put(item);
    setView(shelf);
    setOpenId(item.id); // open it so the price is the next thing you fill in
    if (url) autofill(item, rest !== "");
  }

  const actions: Actions = {
    save: put,
    remove,
    move,
    plan: (item) =>
      put({ ...item, shelf: "month", month, boughtPrice: null, boughtOn: null, sort: nextSort(items.filter((i) => i.shelf === "month" && i.month === month && i.kind === item.kind)) }, "Planned for " + monthName(month)),
    toWindow: (item) => put({ ...item, shelf: "window", boughtPrice: null, boughtOn: null, sort: nextSort(items.filter((i) => i.shelf === "window")) }, "Moved to Window"),
    got: (item, paid) => put({ ...item, shelf: "bought", month, boughtPrice: paid ?? item.price, boughtOn: today }, "Marked as bought"),
    skip: (item) => put({ ...item, shelf: "skipped", month, boughtPrice: null, boughtOn: null }, item.price ? `Skipped. That keeps ${money(item.price)} in your pocket.` : "Skipped"),
  };

  const carry = month >= thisMonth ? carryOver(items, month) : [];
  const win = windowShelf(items);
  const got = receipts(items, month);
  const skp = skipped(items, month);
  const paid = got.reduce((a, i) => a + (i.boughtPrice ?? i.price ?? 0), 0);

  return (
    <div className="flex flex-col gap-4">
      {load.status === "setup" ? (
        <SetupNote />
      ) : load.status === "error" && !ready ? (
        <section className="card p-5">
          <h2 className="text-base font-semibold">Couldn't load your list</h2>
          <p className="mt-1 text-sm text-soft">Check your connection and try again. Anything you added is still saved on this phone.</p>
          <button type="button" onClick={() => setTries((n) => n + 1)} className="mt-3 rounded-full bg-ink px-4 py-2 text-sm font-medium text-cream">
            Try again
          </button>
        </section>
      ) : (
        <>
          <PocketCard
            month={month}
            thisMonth={thisMonth}
            ready={ready}
            pocket={pocket}
            lastBudget={load.budgets[addMonths(month, -1)] ?? null}
            money={money}
            currency={currency}
            onMonth={(d) => {
              const next = addMonths(month, d);
              const diff = (Number(next.slice(0, 4)) - Number(thisMonth.slice(0, 4))) * 12 + (Number(next.slice(5)) - Number(thisMonth.slice(5)));
              if (diff >= FIRST && diff <= LAST) {
                setMonth(next);
                setOpenId(null);
              }
            }}
            onBudget={setBudget}
          />

          <AddRow key={draft?.url ?? "add"} initial={draft ? (draft.url ? `${draft.title} ${draft.url}`.trim() : draft.title) : ""} onAdd={addFromText} />

          <ShelfTabs value={view} onChange={setView} counts={{ month: pocket.order.length, window: win.length, bought: got.length }} />

          {!ready ? (
            <TabSkeleton />
          ) : view === "month" ? (
            <>
              {carry.length > 0 && (
                <CarryCard
                  items={carry}
                  month={month}
                  onBring={() => carry.forEach((i, n) => put({ ...i, month, sort: nextSort(items) + n }))}
                  onSkip={() => carry.forEach((i) => put({ ...i, shelf: "skipped" }))}
                />
              )}
              <MonthList pocket={pocket} reading={reading} openId={openId} setOpenId={setOpenId} money={money} currency={currency} today={today} month={month} actions={actions} />
            </>
          ) : view === "window" ? (
            <ItemList
              items={win}
              reading={reading}
              empty="Paste a link you want to look at later. It waits here, not in your pocket."
              openId={openId}
              setOpenId={setOpenId}
              money={money}
              currency={currency}
              today={today}
              month={month}
              actions={actions}
            />
          ) : (
            <>
              <p className="px-1 text-sm text-soft">{got.length ? `You've paid ${money(paid)} so far in ${monthName(month)}.` : `Nothing bought in ${monthName(month)} yet.`}</p>
              <ItemList items={got} reading={reading} empty="Things you mark as bought show up here, with what you paid." openId={openId} setOpenId={setOpenId} money={money} currency={currency} today={today} month={month} actions={actions} />
              {skp.length > 0 && (
                <>
                  <h3 className="mt-2 px-1 text-xs font-semibold uppercase tracking-wider text-soft">Skipped</h3>
                  <ItemList items={skp} reading={reading} empty="" openId={openId} setOpenId={setOpenId} money={money} currency={currency} today={today} month={month} actions={actions} />
                </>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}

type Actions = {
  save: (next: Item, okText?: string) => void;
  remove: (item: Item) => void;
  move: (item: Item, dir: -1 | 1) => void;
  plan: (item: Item) => void;
  toWindow: (item: Item) => void;
  got: (item: Item, paid: number | null) => void;
  skip: (item: Item) => void;
};

/* ------------------------------ the pocket ------------------------------ */

function PocketCard({
  month,
  thisMonth,
  ready,
  pocket,
  lastBudget,
  money,
  currency,
  onMonth,
  onBudget,
}: {
  month: string;
  thisMonth: string;
  ready: boolean;
  pocket: Pocket;
  lastBudget: number | null;
  money: (n: number) => string;
  currency: string;
  onMonth: (delta: -1 | 1) => void;
  onBudget: (amount: number | null) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState("");
  const { budget } = pocket;
  const asking = ready && (budget === null || editing);

  const fitting = pocket.order.slice(0, pocket.fits).reduce((a, i) => a + (i.price ?? 0), 0);
  const over = Math.max(0, pocket.planned - fitting);
  const total = Math.max(budget ?? 0, pocket.bought + pocket.planned, 1);
  const pct = (n: number) => `${Math.min(100, (n / total) * 100)}%`;
  const when = month === thisMonth ? "this month" : month > thisMonth ? "planning ahead" : "looking back";

  function save() {
    const n = parseMoney(text);
    if (n === undefined) return;
    onBudget(n);
    setEditing(false);
  }

  return (
    <section className="tile tile-lilac p-5">
      <div className="flex items-center gap-2">
        <button type="button" onClick={() => onMonth(-1)} aria-label="Earlier month" className="flex size-8 shrink-0 items-center justify-center rounded-full border border-ink/15 bg-surface/60 active:scale-90">
          <ChevronLeft size={16} />
        </button>
        <div className="min-w-0 flex-1 text-center">
          <p className="truncate text-sm font-semibold">{monthName(month)} {month.slice(0, 4)}</p>
          <p className="text-xs text-soft">{when}</p>
        </div>
        <button type="button" onClick={() => onMonth(1)} aria-label="Later month" className="flex size-8 shrink-0 items-center justify-center rounded-full border border-ink/15 bg-surface/60 active:scale-90">
          <ChevronRight size={16} />
        </button>
      </div>

      <p className="mt-4 text-xs font-semibold uppercase tracking-wider text-soft">Pocket</p>
      {!ready ? (
        <div className="mt-1 h-9 w-32 rounded-lg bg-ink/10 motion-safe:animate-pulse" />
      ) : asking ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            save();
          }}
          className="mt-1"
        >
          <div className="flex items-center gap-2">
            <span className="flex min-w-0 flex-1 items-center gap-1 rounded-2xl border border-ink/20 bg-surface/70 px-3 py-2">
              <span className="text-lg text-soft">{currency}</span>
              <input
                autoFocus={editing}
                value={text}
                inputMode="decimal"
                onChange={(e) => setText(e.target.value)}
                placeholder={budget === null ? "How much can you spend?" : String(budget)}
                aria-label={`Pocket for ${monthName(month)}`}
                className="w-full min-w-0 bg-transparent text-xl font-semibold outline-none placeholder:text-soft"
              />
            </span>
            <button type="submit" className="rounded-full bg-ink px-4 py-2.5 text-sm font-medium text-cream">
              Save
            </button>
          </div>
          {budget === null && lastBudget !== null && (
            <button type="button" onClick={() => onBudget(lastBudget)} className="chip mt-2 rounded-full px-3 py-1.5 text-xs font-medium">
              Use {money(lastBudget)} again
            </button>
          )}
        </form>
      ) : (
        <button
          type="button"
          onClick={() => {
            setText(budget === null ? "" : String(budget));
            setEditing(true);
          }}
          aria-label="Change your pocket"
          className="mt-0.5 text-left text-3xl font-semibold tabular-nums"
        >
          {money(budget ?? 0)}
        </button>
      )}

      {ready && budget !== null && !asking && (
        <>
          <div
            role="img"
            aria-label={pocket.sentence}
            className="mt-3 flex h-2.5 overflow-hidden rounded-full bg-surface/60"
          >
            <div className="h-full bg-ink" style={{ width: pct(pocket.bought) }} />
            <div className="h-full bg-good transition-[width] duration-300" style={{ width: pct(fitting) }} />
            <div className="h-full bg-bad transition-[width] duration-300" style={{ width: pct(over) }} />
          </div>
          <div className="mt-3 grid grid-cols-3 gap-2 text-center">
            <Stat label="Bought" value={money(pocket.bought)} dot="bg-ink" />
            <Stat label="Planned" value={money(pocket.planned)} dot="bg-good" />
            <Stat label={pocket.left !== null && pocket.left < 0 ? "Over" : "Left"} value={money(Math.abs(pocket.left ?? 0))} dot={pocket.left !== null && pocket.left < 0 ? "bg-bad" : "bg-surface"} />
          </div>
        </>
      )}
      {ready && <p className="mt-3 text-sm">{pocket.sentence}</p>}
      {ready && pocket.unpriced > 0 && budget !== null && (
        <p className="mt-1 text-xs text-soft">{pocket.unpriced === 1 ? "1 thing has" : `${pocket.unpriced} things have`} no price yet, so {pocket.unpriced === 1 ? "it isn't" : "they aren't"} counted.</p>
      )}
    </section>
  );
}

function Stat({ label, value, dot }: { label: string; value: string; dot: string }) {
  return (
    <div className="rounded-2xl bg-surface/60 px-2 py-2">
      <p className="flex items-center justify-center gap-1.5 text-xs text-soft">
        <span className={`size-2 rounded-full ${dot}`} />
        {label}
      </p>
      <p className="mt-0.5 text-sm font-semibold tabular-nums">{value}</p>
    </div>
  );
}

/* ------------------------------ adding ------------------------------ */

function AddRow({ initial, onAdd }: { initial: string; onAdd: (text: string) => void }) {
  const [text, setText] = useState(initial);
  function submit() {
    const t = text.trim();
    if (!t) return;
    onAdd(t);
    setText("");
  }
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      className="flex gap-2"
    >
      <input
        value={text}
        onChange={(e) => setText(e.target.value)}
        maxLength={URL_MAX + TITLE_MAX}
        placeholder="Paste a link or type what you need"
        aria-label="Add something"
        className="min-w-0 flex-1 rounded-full border border-ink/15 bg-surface/70 px-4 py-2.5 text-sm outline-none transition-colors placeholder:text-soft focus:border-ink"
      />
      <button type="submit" className="flex shrink-0 items-center gap-1 rounded-full bg-ink px-4 py-2.5 text-sm font-medium text-cream shadow-md shadow-shade/20 active:scale-95">
        <Plus size={15} strokeWidth={2.5} />
        Add
      </button>
    </form>
  );
}

function ShelfTabs({ value, onChange, counts }: { value: View; onChange: (v: View) => void; counts: Record<View, number> }) {
  const tabs: [View, string][] = [
    ["month", "This month"],
    ["window", "Window"],
    ["bought", "Bought"],
  ];
  return (
    <div className="flex rounded-full border border-ink/10 bg-surface/70 p-0.5 text-xs font-medium">
      {tabs.map(([id, label]) => (
        <button
          key={id}
          type="button"
          onClick={() => onChange(id)}
          aria-pressed={value === id}
          className={`flex-1 rounded-full px-2 py-2 transition-colors ${value === id ? "bg-ink text-cream" : "text-soft hover:text-ink"}`}
        >
          {label}
          {counts[id] > 0 && <span className="ml-1 tabular-nums opacity-80">{counts[id]}</span>}
        </button>
      ))}
    </div>
  );
}

function CarryCard({ items, month, onBring, onSkip }: { items: Item[]; month: string; onBring: () => void; onSkip: () => void }) {
  const from = items.every((i) => i.month === items[0].month) ? monthName(items[0].month) : "Earlier months";
  return (
    <section className="card p-4">
      <p className="text-sm">
        <span className="font-semibold">{from}</span> left {items.length === 1 ? "1 thing" : `${items.length} things`} unbought: {listTitles(items.map((i) => brief(i.title)))}.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" onClick={onBring} className="rounded-full bg-ink px-4 py-2 text-sm font-medium text-cream">
          Bring to {monthName(month)}
        </button>
        <button type="button" onClick={onSkip} className="chip rounded-full px-4 py-2 text-sm font-medium">
          Skip {items.length === 1 ? "it" : "them"}
        </button>
      </div>
    </section>
  );
}

function SetupNote() {
  return (
    <section className="card p-5">
      <h2 className="text-base font-semibold">Shop needs a one-time setup</h2>
      <p className="mt-1 text-sm text-soft">
        Run the latest <code>supabase/schema.sql</code> once in the Supabase SQL editor (it adds the Shop tables), then reload. Nothing else changes.
      </p>
    </section>
  );
}

/* ------------------------------ the lists ------------------------------ */

type ListCommon = { reading: Record<string, "reading" | "failed">; openId: string | null; setOpenId: (id: string | null) => void; money: (n: number) => string; currency: string; today: string; month: string; actions: Actions };

/** This month: needs first, wants after, with a dashed line where the pocket runs out. */
function MonthList({ pocket, ...c }: { pocket: Pocket } & ListCommon) {
  if (pocket.order.length === 0) {
    return <p className="px-1 text-sm text-soft">Nothing planned for {monthName(c.month)} yet. Add what you actually need above.</p>;
  }
  const free = pocket.budget === null ? null : pocket.budget - pocket.bought;
  // what the list adds up to after each thing, in packing order
  const totals = pocket.order.reduce<number[]>((acc, i) => [...acc, (acc.length ? acc[acc.length - 1] : 0) + (i.price ?? 0)], []);
  return (
    <ul className="flex flex-col gap-2">
      {pocket.order.map((item, n) => {
        const below = pocket.budget !== null && n >= pocket.fits;
        const showLine = pocket.budget !== null && pocket.fits < pocket.order.length && n === pocket.fits;
        const mates = pocket.order.filter((i) => i.kind === item.kind);
        const at = mates.findIndex((i) => i.id === item.id);
        return (
          <li key={item.id} className="flex flex-col gap-2">
            {showLine && (
              <div className="flex items-center gap-2 py-1 text-xs text-soft" role="separator">
                <span className="flex-1 border-t-2 border-dashed border-ink/40" />
                Your pocket ends here
                <span className="flex-1 border-t-2 border-dashed border-ink/40" />
              </div>
            )}
            <ItemCard
              item={item}
              index={n}
              dim={below}
              hint={below && free !== null ? `Over by ${c.money(totals[n] - free)}` : undefined}
              status={c.reading[item.id]}
              canUp={at > 0}
              canDown={at < mates.length - 1}
              open={c.openId === item.id}
              onToggle={() => c.setOpenId(c.openId === item.id ? null : item.id)}
              money={c.money}
              currency={c.currency}
              today={c.today}
              actions={c.actions}
            />
          </li>
        );
      })}
    </ul>
  );
}

function ItemList({ items, empty, ...c }: { items: Item[]; empty: string } & ListCommon) {
  if (items.length === 0) return empty ? <p className="px-1 text-sm text-soft">{empty}</p> : null;
  return (
    <ul className="flex flex-col gap-2">
      {items.map((item, n) => (
        <li key={item.id}>
          <ItemCard
            item={item}
            index={n}
            canUp={false}
            canDown={false}
            status={c.reading[item.id]}
            open={c.openId === item.id}
            onToggle={() => c.setOpenId(c.openId === item.id ? null : item.id)}
            money={c.money}
            currency={c.currency}
            today={c.today}
            actions={c.actions}
          />
        </li>
      ))}
    </ul>
  );
}

/* ------------------------------ one thing ------------------------------ */

function ItemCard({
  item,
  index,
  dim,
  hint,
  status,
  canUp,
  canDown,
  open,
  onToggle,
  money,
  currency,
  today,
  actions,
}: {
  item: Item;
  index: number;
  dim?: boolean;
  hint?: string;
  /** a pasted link being read, or one that couldn't be */
  status?: "reading" | "failed";
  canUp: boolean;
  canDown: boolean;
  open: boolean;
  onToggle: () => void;
  money: (n: number) => string;
  currency: string;
  today: string;
  actions: Actions;
}) {
  const Icon = shopIcon(item.icon);
  const host = hostOf(item.url);
  const shown = item.shelf === "bought" ? (item.boughtPrice ?? item.price) : item.price;
  const meta =
    item.shelf === "bought" && item.boughtOn
      ? `Bought ${prettyDate(item.boughtOn).split(",").slice(-1)[0].trim()}${item.price !== null && item.boughtPrice !== null && item.price !== item.boughtPrice ? ` · planned ${money(item.price)}` : ""}`
      : hint;

  return (
    <div className={`card ${dim ? "border-dashed" : ""}`}>
      <div className="flex items-center gap-2 p-3">
        <button type="button" onClick={onToggle} aria-expanded={open} className="flex min-w-0 flex-1 items-center gap-3 text-left">
          <span className={`flex size-12 shrink-0 items-center justify-center rounded-2xl text-onpastel transition-opacity ${PASTELS[index % PASTELS.length]} ${dim ? "opacity-50" : ""}`}>
            <Icon size={22} strokeWidth={1.8} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="line-clamp-2 wrap-break-word text-[15px] font-semibold leading-tight">{item.title}</span>
            <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-soft">
              {item.shelf === "month" && (
                <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${item.kind === "need" ? "bg-ink text-cream" : "border border-ink/40 text-ink"}`}>{item.kind === "need" ? "Need" : "Want"}</span>
              )}
              {host && <span className="truncate">{host}</span>}
              {meta && <span>{meta}</span>}
              {status === "reading" && <span role="status">Reading the link…</span>}
              {status === "failed" && <span>Couldn't read that page. Add the price yourself.</span>}
            </span>
          </span>
          <span className="shrink-0 text-right text-sm font-semibold tabular-nums">{shown === null ? <span className="text-xs font-normal text-soft">No price</span> : money(shown)}</span>
        </button>
        {item.url && (
          <a
            href={item.url}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`Open ${host || "link"} in a new tab`}
            className="flex size-9 shrink-0 items-center justify-center rounded-full border border-ink/15 bg-surface/60 text-soft transition-colors hover:text-ink active:scale-90"
          >
            <ExternalLink size={16} />
          </a>
        )}
      </div>

      <Fold open={open}>
        <Editor item={item} canUp={canUp} canDown={canDown} money={money} currency={currency} today={today} actions={actions} />
      </Fold>
    </div>
  );
}

function Editor({ item, canUp, canDown, money, currency, today, actions }: { item: Item; canUp: boolean; canDown: boolean; money: (n: number) => string; currency: string; today: string; actions: Actions }) {
  const [paying, setPaying] = useState(false);
  const set = (patch: Partial<Item>, okText?: string) => actions.save({ ...item, ...patch }, okText);

  return (
    <div className="space-y-3 border-t border-ink/10 px-3 pb-3 pt-3">
      <Field label="What is it" value={item.title} max={TITLE_MAX} onCommit={(v) => v.trim() && set({ title: v })} />
      <div className="grid grid-cols-2 gap-2">
        <Field
          label={item.shelf === "bought" ? "Planned price" : "Price"}
          value={item.price === null ? "" : String(item.price)}
          prefix={currency}
          mode="decimal"
          placeholder="Optional"
          onCommit={(v) => {
            const n = parseMoney(v);
            if (n !== undefined) set({ price: n });
          }}
        />
        <Field label="Link" value={item.url} max={URL_MAX} placeholder="Optional" onCommit={(v) => set({ url: v })} />
      </div>
      {item.shelf === "bought" && (
        <Field
          label={`Paid${item.boughtOn ? ` on ${prettyDate(item.boughtOn).split(",").slice(-1)[0].trim()}` : ""}`}
          value={item.boughtPrice === null ? "" : String(item.boughtPrice)}
          prefix={currency}
          mode="decimal"
          onCommit={(v) => {
            const n = parseMoney(v);
            if (n !== undefined) set({ boughtPrice: n });
          }}
        />
      )}
      <Field label="Note" value={item.note} max={200} placeholder="Size, colour, why you need it" onCommit={(v) => set({ note: v })} />

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium text-soft">It's a</span>
        {(["need", "want"] as Kind[]).map((k) => (
          <Chip key={k} small on={item.kind === k} onClick={() => set({ kind: k })}>
            {k === "need" ? "Need" : "Want"}
          </Chip>
        ))}
      </div>

      <div>
        <p className="mb-1.5 text-xs font-medium text-soft">Icon</p>
        <div role="radiogroup" aria-label="Icon" className="grid grid-cols-6 gap-1.5">
          {SHOP_ICON_IDS.map((id) => {
            const I = shopIcon(id);
            const on = id === item.icon;
            return (
              <button
                key={id}
                type="button"
                role="radio"
                aria-checked={on}
                aria-label={shopIconLabel(id)}
                title={shopIconLabel(id)}
                onClick={() => set({ icon: id })}
                className={`flex h-10 items-center justify-center rounded-xl border transition-colors ${on ? "border-transparent bg-ink text-cream" : "border-ink/15 bg-surface/60 text-soft hover:text-ink"}`}
              >
                <I size={18} strokeWidth={1.8} />
              </button>
            );
          })}
        </div>
      </div>

      {paying && (
        <PayRow
          currency={currency}
          start={item.price}
          onConfirm={(n) => {
            actions.got(item, n);
            setPaying(false);
          }}
          onCancel={() => setPaying(false)}
        />
      )}

      <div className="flex flex-wrap items-center gap-2 pt-1">
        {item.shelf === "month" && !paying && (
          <button type="button" onClick={() => setPaying(true)} className="flex items-center gap-1 rounded-full bg-ink px-3.5 py-2 text-sm font-medium text-cream active:scale-95">
            <Check size={15} strokeWidth={2.5} />
            Got it
          </button>
        )}
        {item.shelf === "window" && (
          <button type="button" onClick={() => actions.plan(item)} className="rounded-full bg-ink px-3.5 py-2 text-sm font-medium text-cream active:scale-95">
            Plan it this month
          </button>
        )}
        {(item.shelf === "bought" || item.shelf === "skipped") && (
          <button type="button" onClick={() => actions.plan(item)} className="rounded-full bg-ink px-3.5 py-2 text-sm font-medium text-cream active:scale-95">
            {item.shelf === "bought" ? "Put back on the list" : "Plan it again"}
          </button>
        )}
        {item.shelf === "month" && (
          <>
            <button type="button" onClick={() => actions.toWindow(item)} className="chip rounded-full px-3 py-1.5 text-xs font-medium">
              To Window
            </button>
            <button type="button" onClick={() => actions.skip(item)} className="chip rounded-full px-3 py-1.5 text-xs font-medium">
              Skip it
            </button>
          </>
        )}
        {canUp && (
          <button type="button" onClick={() => actions.move(item, -1)} aria-label="Move earlier" className="chip flex size-8 items-center justify-center rounded-full">
            <ArrowUp size={14} />
          </button>
        )}
        {canDown && (
          <button type="button" onClick={() => actions.move(item, 1)} aria-label="Move later" className="chip flex size-8 items-center justify-center rounded-full">
            <ArrowDown size={14} />
          </button>
        )}
        <button type="button" onClick={() => actions.remove(item)} className="ml-auto flex items-center gap-1 rounded-full px-2.5 py-1.5 text-xs font-medium text-danger hover:brightness-90">
          <Trash2 size={13} />
          Remove
        </button>
      </div>
      {item.shelf === "month" && <p className="text-xs text-soft">Needs are packed first, then wants, in the order you set. Use the arrows to change it.</p>}
      <p className="sr-only">Today is {today}</p>
    </div>
  );
}

function PayRow({ currency, start, onConfirm, onCancel }: { currency: string; start: number | null; onConfirm: (paid: number | null) => void; onCancel: () => void }) {
  const [text, setText] = useState(start === null ? "" : String(start));
  function confirm() {
    const n = parseMoney(text);
    if (n !== undefined) onConfirm(n);
  }
  return (
    <div className="rounded-2xl bg-ink/5 p-3">
      <p className="text-xs font-medium text-soft">What did you pay?</p>
      <div className="mt-1.5 flex items-center gap-2">
        <span className="flex min-w-0 flex-1 items-center gap-1 rounded-xl border border-ink/20 bg-surface/70 px-3 py-2">
          <span className="text-sm text-soft">{currency}</span>
          <input
            autoFocus
            value={text}
            inputMode="decimal"
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && confirm()}
            aria-label="What you paid"
            className="w-full min-w-0 bg-transparent text-sm outline-none"
          />
        </span>
        <button type="button" onClick={confirm} className="rounded-full bg-ink px-4 py-2 text-sm font-medium text-cream">
          Done
        </button>
        <button type="button" onClick={onCancel} className="rounded-full px-2 py-2 text-sm text-soft underline underline-offset-2">
          Cancel
        </button>
      </div>
    </div>
  );
}

/** A text box that saves when you leave it (typing 1299 isn't saved as 1, then 12, then 129). */
function Field({ label, value, onCommit, placeholder, max, mode, prefix }: { label: string; value: string; onCommit: (v: string) => void; placeholder?: string; max?: number; mode?: "decimal"; prefix?: string }) {
  return (
    <label className="block min-w-0">
      <span className="mb-1 block text-xs font-medium text-soft">{label}</span>
      <span className="flex items-center gap-1 rounded-xl border border-ink/15 bg-surface/70 px-3 py-2 transition-colors focus-within:border-ink">
        {prefix && <span className="text-sm text-soft">{prefix}</span>}
        <input
          // follows the item when it changes under you (a link read in, a price set elsewhere)
          key={value}
          defaultValue={value}
          inputMode={mode}
          maxLength={max}
          placeholder={placeholder}
          onBlur={(e) => e.currentTarget.value !== value && onCommit(e.currentTarget.value)}
          onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
          className="w-full min-w-0 bg-transparent text-sm outline-none placeholder:text-soft"
        />
      </span>
    </label>
  );
}
