// Which websites may embed / submit to a workspace's modules.

/** "https://www.Example.com/path" | "example.com." -> "www.example.com" */
export function normalizeHost(input: string): string | null {
  const s = input.trim().toLowerCase();
  if (!s) return null;
  try {
    const u = new URL(/^[a-z]+:\/\//.test(s) ? s : `https://${s}`);
    const host = u.hostname.replace(/\.$/, "");
    if (!host || host.includes(" ")) return null;
    if (host !== "localhost" && !/^[a-z0-9.-]+\.[a-z]{2,}$/.test(host)) return null;
    return host;
  } catch {
    return null;
  }
}

/** Clean a list typed by an owner/operator into unique hostnames. */
export function normalizeDomainList(list: unknown): string[] {
  const out = new Set<string>();
  for (const d of Array.isArray(list) ? list : []) {
    if (typeof d !== "string") continue;
    const h = normalizeHost(d);
    if (h) out.add(h);
  }
  return [...out].slice(0, 20);
}

/**
 * True if `origin` (an Origin header value) is one of the workspace's domains.
 * Exact hostname match only — "example.com" does not allow "evil-example.com"
 * or "sub.example.com"; list each hostname (e.g. www.) explicitly.
 * localhost is only allowed when explicitly listed (for testing).
 */
export function isAllowedOrigin(origin: string | null | undefined, domains: string[]): boolean {
  if (!origin || origin === "null") return false;
  let u: URL;
  try {
    u = new URL(origin);
  } catch {
    return false;
  }
  if (u.protocol !== "https:" && !(u.protocol === "http:" && u.hostname === "localhost")) return false;
  return domains.includes(u.hostname.toLowerCase());
}

/** Value for a CSP frame-ancestors directive. */
export function frameAncestors(domains: string[]): string {
  const parts = domains.map((d) => (d === "localhost" ? "http://localhost:*" : `https://${d}`));
  return parts.length ? parts.join(" ") : "'none'";
}
