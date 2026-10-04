// Reading a shop page's own preview tags (title, price) and deciding which addresses are never OK to
// visit on someone's behalf. Plain code with no network, so every rule here can be tested directly.
// The fetching itself is in linkpreview.ts (server only).

// ---------------------------------------------------------------- which addresses are off limits

const V4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;

function v4Parts(ip: string): [number, number, number, number] | null {
  const m = ip.match(V4);
  if (!m) return null;
  const p = m.slice(1).map(Number) as [number, number, number, number];
  return p.every((n) => n >= 0 && n <= 255) ? p : null;
}

function blockedV4([a, b, c]: [number, number, number, number]): boolean {
  return (
    a === 0 || // "this network"
    a === 10 || // private
    a === 127 || // loopback
    (a === 100 && b >= 64 && b <= 127) || // carrier-grade NAT
    (a === 169 && b === 254) || // link-local, and the cloud metadata address lives here
    (a === 172 && b >= 16 && b <= 31) || // private
    (a === 192 && b === 0 && (c === 0 || c === 2)) || // special use / documentation
    (a === 192 && b === 168) || // private
    (a === 198 && (b === 18 || b === 19)) || // benchmarking
    (a === 198 && b === 51 && c === 100) || // documentation
    (a === 203 && b === 0 && c === 113) || // documentation
    a >= 224 // multicast, reserved, broadcast
  );
}

/** The eight 16-bit groups of an IPv6 address, or null if it isn't one. */
function v6Groups(ip: string): number[] | null {
  let s = ip.toLowerCase().replace(/^\[|\]$/g, "").split("%")[0];
  if (!s.includes(":")) return null;
  // an IPv4 tail ("::ffff:10.0.0.1") becomes two groups
  const tail = s.match(/(\d{1,3}(?:\.\d{1,3}){3})$/);
  if (tail) {
    const p = v4Parts(tail[1]);
    if (!p) return null;
    s = s.slice(0, -tail[1].length) + ((p[0] << 8) | p[1]).toString(16) + ":" + ((p[2] << 8) | p[3]).toString(16);
  }
  const halves = s.split("::");
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(":") : [];
  const rest = halves.length === 2 && halves[1] ? halves[1].split(":") : [];
  const fill = halves.length === 2 ? 8 - head.length - rest.length : 0;
  if (fill < 0 || (halves.length === 1 && head.length !== 8)) return null;
  const groups = [...head, ...Array(fill).fill("0"), ...rest];
  if (groups.length !== 8) return null;
  const out = groups.map((g) => (/^[0-9a-f]{1,4}$/.test(g) ? parseInt(g, 16) : NaN));
  return out.some(Number.isNaN) ? null : out;
}

/** True for any address a link preview must never connect to: private, loopback, link-local, multicast, reserved, or not an address at all. */
export function isBlockedIp(ip: string): boolean {
  const v4 = v4Parts(ip);
  if (v4) return blockedV4(v4);
  const g = v6Groups(ip);
  if (!g) return true; // can't read it: don't trust it
  const embedded = (hi: number, lo: number): [number, number, number, number] => [hi >> 8, hi & 255, lo >> 8, lo & 255];
  if (g.every((x) => x === 0)) return true; // ::
  if (g.slice(0, 7).every((x) => x === 0) && g[7] === 1) return true; // ::1
  if (g.slice(0, 5).every((x) => x === 0) && g[5] === 0xffff) return blockedV4(embedded(g[6], g[7])); // IPv4-mapped
  if (g[0] === 0x64 && g[1] === 0xff9b && g.slice(2, 6).every((x) => x === 0)) return blockedV4(embedded(g[6], g[7])); // NAT64
  if (g[0] === 0x2002) return blockedV4(embedded(g[1], g[2])); // 6to4 carries an IPv4 address
  if ((g[0] & 0xfe00) === 0xfc00) return true; // fc00::/7 unique local
  if ((g[0] & 0xffc0) === 0xfe80) return true; // fe80::/10 link-local
  if ((g[0] & 0xff00) === 0xff00) return true; // ff00::/8 multicast
  if (g[0] === 0x2001 && g[1] === 0x0db8) return true; // documentation
  if (g[0] === 0x2001 && g[1] === 0) return true; // Teredo
  return false;
}

// ---------------------------------------------------------------- reading a page's preview tags

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", rsquo: "'", lsquo: "'", ldquo: '"', rdquo: '"', ndash: "–", mdash: "—", rupee: "₹", hellip: "…" };

export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, code: string) => {
    if (code[0] === "#") {
      const n = code[1].toLowerCase() === "x" ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : whole;
    }
    return ENTITIES[code.toLowerCase()] ?? whole;
  });
}

const tidy = (s: string) => decodeEntities(s).replace(/\s+/g, " ").trim();

/** "1,299.00" / "₹ 1299" / "1.299,50" -> a number, or null. */
export function parsePriceText(raw: unknown): number | null {
  if (typeof raw === "number") return Number.isFinite(raw) && raw > 0 ? raw : null;
  if (typeof raw !== "string") return null;
  const first = raw.search(/\d/);
  if (first < 0) return null;
  // everything before the first digit is a label or symbol ("Rs.", "₹", "Price:"), never part of the number
  let t = raw.slice(first).replace(/[^\d.,]/g, "").replace(/[.,]+$/, "");
  if (!t) return null;
  const lastDot = t.lastIndexOf(".");
  const lastComma = t.lastIndexOf(",");
  if (lastDot >= 0 && lastComma >= 0) {
    // both present: the later one is the decimal mark ("1,299.50" or "1.299,50")
    t = lastDot > lastComma ? t.replace(/,/g, "") : t.replace(/\./g, "").replace(",", ".");
  } else if (lastComma >= 0) {
    t = /,\d{1,2}$/.test(t) && t.indexOf(",") === lastComma ? t.replace(",", ".") : t.replace(/,/g, ""); // "12,50" decimal, "1,299" thousands
  }
  const n = Number(t);
  return Number.isFinite(n) && n > 0 && n < 100_000_000 ? Math.round(n * 100) / 100 : null;
}

type Meta = Record<string, string>;

/** Every <meta> tag as property/name/itemprop -> content (first one wins). Handles any attribute order and either quote style. */
function metaTags(html: string): Meta {
  const out: Meta = {};
  for (const m of html.matchAll(/<meta\b([^>]*)>/gi)) {
    const attrs: Record<string, string> = {};
    for (const a of m[1].matchAll(/([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/g)) {
      attrs[a[1].toLowerCase()] = a[2] ?? a[3] ?? a[4] ?? "";
    }
    const key = (attrs.property || attrs.name || attrs.itemprop || "").toLowerCase();
    if (key && attrs.content !== undefined && !(key in out)) out[key] = attrs.content;
  }
  return out;
}

/** The first price found in the page's structured data (JSON-LD Product -> offers). */
function jsonLdPrice(html: string): number | null {
  const look = (node: unknown, depth: number): number | null => {
    if (!node || typeof node !== "object" || depth > 8) return null;
    if (Array.isArray(node)) {
      for (const n of node) {
        const p = look(n, depth + 1);
        if (p !== null) return p;
      }
      return null;
    }
    const o = node as Record<string, unknown>;
    const offers = o.offers;
    if (offers) {
      const p = priceOfOffers(offers);
      if (p !== null) return p;
    }
    for (const k of Object.keys(o)) {
      if (k === "@graph" || k === "itemListElement" || k === "mainEntity") {
        const p = look(o[k], depth + 1);
        if (p !== null) return p;
      }
    }
    return null;
  };
  const priceOfOffers = (offers: unknown): number | null => {
    const list = Array.isArray(offers) ? offers : [offers];
    for (const offer of list) {
      if (!offer || typeof offer !== "object") continue;
      const o = offer as Record<string, unknown>;
      const spec = o.priceSpecification as Record<string, unknown> | Record<string, unknown>[] | undefined;
      const fromSpec = Array.isArray(spec) ? spec[0]?.price : spec?.price;
      const p = parsePriceText(o.price) ?? parsePriceText(o.lowPrice) ?? parsePriceText(fromSpec);
      if (p !== null) return p;
    }
    return null;
  };
  for (const m of html.matchAll(/<script\b[^>]*type\s*=\s*["']?application\/ld\+json["']?[^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const p = look(JSON.parse(m[1].trim()), 0);
      if (p !== null) return p;
    } catch {
      /* a broken block says nothing; try the next one */
    }
  }
  return null;
}

export type Preview = { title: string; price: number | null; site: string };

/**
 * Shop filler around a name: "Phone (128 GB) Online at Best Price On Flipkart.com" -> "Phone (128 GB)",
 * "Buy Lip Balm Online" -> "Lip Balm". A name that merely ends in "Online" ("Elder Scrolls Online") is left alone,
 * and nothing is ever cut down to nothing.
 */
function withoutShopTalk(title: string): string {
  const cut = title.replace(/\s+(?:online\s+)?(?:at|@|in|on)\s+(?:the\s+)?(?:best|lowest|low|great|cheap)\s+prices?\b.*$/i, "");
  const pair = /^buy\s+(.+?)\s+online(?:\s+(?:in|at|on)\s+[\w.]+(?:\s+india)?)?\s*$/i.exec(cut);
  const out = (pair ? pair[1] : cut !== title ? cut.replace(/^buy\s+/i, "") : cut).trim();
  return out.length >= 3 ? out : title;
}

/** What a page says about itself: a title, a price if it states one, and the shop's name. Only ever the page's own preview tags. */
export function parsePreview(html: string, host: string): Preview {
  const head = html.slice(0, 600_000);
  const meta = metaTags(head);
  const site = tidy(meta["og:site_name"] ?? "") || host;
  const pageTitle = head.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "";
  let title = tidy(meta["og:title"] ?? meta["twitter:title"] ?? pageTitle);
  // "Running shoes | Myntra" -> "Running shoes"
  for (const sep of [" | ", " - ", " – ", " — ", " : "]) {
    const i = title.lastIndexOf(sep);
    if (i > 0 && site && title.slice(i + sep.length).toLowerCase().replace(/\.[a-z.]+$/, "") === site.toLowerCase().replace(/\.[a-z.]+$/, "")) {
      title = title.slice(0, i).trim();
      break;
    }
  }
  title = withoutShopTalk(title);
  const label = (meta["twitter:label1"] ?? "").toLowerCase();
  const price =
    parsePriceText(meta["product:price:amount"]) ??
    parsePriceText(meta["og:price:amount"]) ??
    parsePriceText(meta["price"]) ??
    (label.includes("price") ? parsePriceText(meta["twitter:data1"]) : null) ??
    jsonLdPrice(head);
  return { title, price, site };
}
