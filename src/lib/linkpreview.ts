import dns from "node:dns/promises";
import http from "node:http";
import https from "node:https";
import net from "node:net";
import zlib from "node:zlib";
import { isBlockedIp } from "./linkparse";

// Fetches one page a person pasted, so Shop can read its title and price (like the little card a chat app
// builds from a link). Server only. It is careful on purpose, because it makes a request for a link
// someone typed:
//  - only http(s), only the ordinary ports, no logins in the address
//  - the address is looked up ONCE, checked, and that exact address is connected to (so a name can't
//    answer "safe" to the check and "private" to the connection)
//  - every redirect is checked the same way, at most four
//  - a few seconds and about a megabyte at most, HTML only
// It never crawls, never repeats, and never stores the page.

export type FetchOpts = {
  timeoutMs?: number;
  maxBytes?: number;
  maxRedirects?: number;
  /** tests only: allow loopback addresses so a local server can stand in for a shop */
  allowPrivate?: boolean;
  /** tests only: stand-in for DNS */
  lookup?: (host: string) => Promise<string[]>;
};

const UA = "Mozilla/5.0 (compatible; QwencyLinkPreview/1.0; one page, on request)";

export class Refused extends Error {}

async function vetted(host: string, o: FetchOpts): Promise<string> {
  const name = host.replace(/^\[|\]$/g, "");
  if (net.isIP(name)) {
    if (!o.allowPrivate && isBlockedIp(name)) throw new Refused("that address isn't allowed");
    return name;
  }
  const found = o.lookup ? await o.lookup(name) : (await dns.lookup(name, { all: true })).map((a) => a.address);
  if (found.length === 0) throw new Refused("no address");
  if (!o.allowPrivate && found.some((ip) => isBlockedIp(ip))) throw new Refused("that address isn't allowed");
  return found[0];
}

type Hop = { status: number; location: string | null; contentType: string; body: Buffer };

function getOnce(url: URL, ip: string, o: Required<Pick<FetchOpts, "timeoutMs" | "maxBytes">>): Promise<Hop> {
  return new Promise((resolve, reject) => {
    const secure = url.protocol === "https:";
    const req = (secure ? https : http).request(
      {
        host: ip,
        port: url.port || (secure ? 443 : 80),
        path: `${url.pathname}${url.search}`,
        method: "GET",
        servername: secure && !net.isIP(url.hostname) ? url.hostname : undefined,
        headers: { host: url.host, "user-agent": UA, accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.1", "accept-language": "en", "accept-encoding": "gzip, deflate" },
        timeout: o.timeoutMs,
        // some shops (Nykaa) answer with more header than Node's 16 KB default allows, and are refused as a "parse error"
        maxHeaderSize: 65_536,
      },
      (res) => {
        const status = res.statusCode ?? 0;
        const location = typeof res.headers.location === "string" ? res.headers.location : null;
        const contentType = String(res.headers["content-type"] ?? "").toLowerCase();
        if (status >= 300 && status < 400) {
          res.resume();
          resolve({ status, location, contentType, body: Buffer.alloc(0) });
          return;
        }
        const enc = String(res.headers["content-encoding"] ?? "").toLowerCase();
        const stream = enc.includes("gzip") ? res.pipe(zlib.createGunzip()) : enc.includes("deflate") ? res.pipe(zlib.createInflate()) : res;
        const chunks: Buffer[] = [];
        let size = 0;
        let done = false;
        const finish = () => {
          if (done) return;
          done = true;
          resolve({ status, location, contentType, body: Buffer.concat(chunks) });
        };
        stream.on("data", (c: Buffer) => {
          size += c.length;
          chunks.push(size > o.maxBytes ? c.subarray(0, c.length - (size - o.maxBytes)) : c);
          if (size >= o.maxBytes) {
            res.destroy(); // enough: the preview tags are in the first part
            finish();
          }
        });
        stream.on("end", finish);
        stream.on("error", (e) => (done ? undefined : (done = true, reject(e))));
        res.on("error", (e) => (done ? undefined : (done = true, reject(e))));
        // a plain body ends when the connection closes; a compressed one only when the decompressor has
        // flushed (closing sooner would hand back a half-empty page)
        if (stream === res) res.on("close", finish);
      },
    );
    req.on("timeout", () => req.destroy(new Error("timed out")));
    req.on("error", reject);
    req.end();
  });
}

function decode(body: Buffer, contentType: string): string {
  const label = contentType.match(/charset=["']?([\w-]+)/)?.[1] ?? "utf-8";
  try {
    return new TextDecoder(label, { fatal: false }).decode(body);
  } catch {
    return new TextDecoder("utf-8", { fatal: false }).decode(body);
  }
}

/** The page behind a link and where it finally was. Throws Refused for anything not allowed. */
export async function fetchPage(link: string, opts: FetchOpts = {}): Promise<{ finalUrl: string; html: string }> {
  const o = { timeoutMs: opts.timeoutMs ?? 5000, maxBytes: opts.maxBytes ?? 1_000_000, maxRedirects: opts.maxRedirects ?? 4 };
  let url: URL;
  try {
    url = new URL(link);
  } catch {
    throw new Refused("not a link");
  }
  for (let hop = 0; ; hop++) {
    if (url.protocol !== "http:" && url.protocol !== "https:") throw new Refused("only web links");
    if (url.username || url.password) throw new Refused("no logins in links");
    if (!opts.allowPrivate && url.port && url.port !== "80" && url.port !== "443") throw new Refused("only the ordinary ports");
    const ip = await vetted(url.hostname, opts);
    const res = await getOnce(url, ip, o);
    if (res.status >= 300 && res.status < 400 && res.location) {
      if (hop >= o.maxRedirects) throw new Refused("too many redirects");
      url = new URL(res.location, url); // relative redirects resolve against where we were
      continue;
    }
    if (res.status < 200 || res.status >= 300) throw new Refused(`the shop answered ${res.status}`);
    if (res.contentType && !/html|xml/.test(res.contentType)) throw new Refused("not a web page");
    return { finalUrl: url.toString(), html: decode(res.body, res.contentType) };
  }
}
