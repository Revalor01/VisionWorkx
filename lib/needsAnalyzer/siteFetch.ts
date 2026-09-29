import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

// Fetches a business's public website for the Needs Analyzer's website check.
// The operator types the address, so this is an SSRF surface: only http(s) on the
// normal ports, no credentials, and every hostname (including each redirect hop)
// must resolve only to public addresses. Pages are capped in size and time.
// Residual risk: DNS could change between our lookup and fetch's own lookup
// (rebinding). Acceptable for an operator-only tool; revisit if this is ever
// opened to customers.

export const MAX_PAGE_BYTES = 2 * 1024 * 1024;
export const PAGE_TIMEOUT_MS = 8000;
const MAX_REDIRECTS = 5;
const USER_AGENT = "Mozilla/5.0 (compatible; RevalorSiteCheck/1.0; +https://products.revalorllc.com)";

export class SiteFetchError extends Error {}

/** Accepts "example.com", "www.example.com/contact" or a full http(s) URL. */
export function normalizeSiteUrl(input: string): URL {
  const raw = input.trim();
  if (!raw || raw.length > 2048) throw new SiteFetchError("Enter a website address");
  let u: URL;
  try {
    u = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`);
  } catch {
    throw new SiteFetchError("That doesn't look like a website address");
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") throw new SiteFetchError("Only http and https websites can be checked");
  if (u.username || u.password) throw new SiteFetchError("Remove the username/password from the address");
  if (u.port && u.port !== "80" && u.port !== "443") throw new SiteFetchError("Only normal website ports (80/443) can be checked");
  const h = u.hostname.toLowerCase();
  if (!h.includes(".") && !isIP(h.replace(/^\[|\]$/g, ""))) throw new SiteFetchError("That doesn't look like a public website");
  if (h === "localhost" || /\.(localhost|local|internal|lan|home|corp)$/.test(h)) throw new SiteFetchError("That isn't a public website");
  u.hash = "";
  return u;
}

function v4ToInt(ip: string): number {
  return ip.split(".").reduce((n, p) => n * 256 + Number(p), 0);
}
const V4_BLOCKED: [string, number][] = [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
];

/** True for loopback, private, link-local, CGNAT, multicast, reserved and documentation ranges (v4 and v6). */
export function isBlockedAddress(ip: string): boolean {
  const kind = isIP(ip);
  if (kind === 4) {
    const n = v4ToInt(ip);
    return V4_BLOCKED.some(([base, bits]) => {
      const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
      return ((n & mask) >>> 0) === ((v4ToInt(base) & mask) >>> 0);
    });
  }
  if (kind === 6) {
    const a = ip.toLowerCase();
    if (a === "::" || a === "::1") return true;
    const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(a);
    if (mapped) return isBlockedAddress(mapped[1]);
    if (/^::ffff:[0-9a-f]{1,4}:[0-9a-f]{1,4}$/.test(a)) return true; // hex-form mapped v4: refuse rather than decode
    const first = parseInt(a.split(":")[0] || "0", 16);
    if ((first & 0xfe00) === 0xfc00) return true; // fc00::/7 unique local
    if ((first & 0xffc0) === 0xfe80) return true; // fe80::/10 link-local
    if ((first & 0xff00) === 0xff00) return true; // ff00::/8 multicast
    if (a.startsWith("64:ff9b:") || a.startsWith("2001:db8:") || a.startsWith("100::")) return true; // NAT64, documentation, discard
    return false;
  }
  return true; // not an IP at all
}

async function assertPublicHost(hostname: string) {
  const h = hostname.replace(/^\[|\]$/g, "");
  if (isIP(h)) {
    if (isBlockedAddress(h)) throw new SiteFetchError("That address isn't a public website");
    return;
  }
  let addrs: { address: string }[];
  try {
    addrs = await lookup(h, { all: true, verbatim: true });
  } catch {
    throw new SiteFetchError(`Couldn't find ${h}. Check the spelling.`);
  }
  if (!addrs.length || addrs.some((a) => isBlockedAddress(a.address))) throw new SiteFetchError("That address isn't a public website");
}

export interface FetchedPage {
  url: string; // requested
  finalUrl: string; // after redirects
  status: number;
  ms: number;
  contentType: string;
  html: string; // empty for non-HTML responses
  truncated: boolean;
  redirects: string[];
}

async function readCapped(res: Response): Promise<{ text: string; truncated: boolean }> {
  if (!res.body) return { text: "", truncated: false };
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  let truncated = false;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_PAGE_BYTES) {
      chunks.push(value.subarray(0, value.byteLength - (size - MAX_PAGE_BYTES)));
      truncated = true;
      await reader.cancel().catch(() => {});
      break;
    }
    chunks.push(value);
  }
  return { text: new TextDecoder("utf-8", { fatal: false }).decode(Buffer.concat(chunks)), truncated };
}

/** One page, following redirects by hand so every hop is checked. */
export async function fetchPage(start: URL): Promise<FetchedPage> {
  const t0 = Date.now();
  const redirects: string[] = [];
  let url = start;
  for (let hop = 0; ; hop++) {
    normalizeSiteUrl(url.href); // re-validate scheme, port, credentials, hostname
    await assertPublicHost(url.hostname);
    let res: Response;
    try {
      res = await fetch(url, {
        redirect: "manual",
        headers: { "user-agent": USER_AGENT, accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.5" },
        signal: AbortSignal.timeout(PAGE_TIMEOUT_MS),
      });
    } catch (e) {
      const msg = e instanceof Error && e.name === "TimeoutError" ? "took too long to respond" : "couldn't be reached";
      throw new SiteFetchError(`${url.hostname} ${msg}`);
    }
    const loc = res.headers.get("location");
    if (res.status >= 300 && res.status < 400 && loc) {
      await res.body?.cancel().catch(() => {});
      if (hop >= MAX_REDIRECTS) throw new SiteFetchError("Too many redirects");
      url = new URL(loc, url);
      redirects.push(url.href);
      continue;
    }
    const contentType = res.headers.get("content-type") || "";
    const isHtml = /html|xml/i.test(contentType) || !contentType;
    const { text, truncated } = isHtml ? await readCapped(res) : { text: "", truncated: false };
    if (!isHtml) await res.body?.cancel().catch(() => {});
    return { url: start.href, finalUrl: url.href, status: res.status, ms: Date.now() - t0, contentType, html: text, truncated, redirects };
  }
}
