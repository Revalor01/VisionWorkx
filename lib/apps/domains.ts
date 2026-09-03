// Phase 5: self-serve custom domains via the Vercel API. Reuses the same
// VERCEL_API_TOKEN / VERCEL_TEAM_ID the deploy pipeline uses.

const VERCEL_TOKEN = process.env.VERCEL_API_TOKEN;
const VERCEL_TEAM = process.env.VERCEL_TEAM_ID || null;
const BASE = "https://api.vercel.com";

function url(path: string): string {
  const q = VERCEL_TEAM ? `?teamId=${encodeURIComponent(VERCEL_TEAM)}` : "";
  return BASE + path + q;
}
function headers() {
  return { Authorization: `Bearer ${VERCEL_TOKEN}`, "Content-Type": "application/json" };
}

export interface DomainRecord {
  type: string;
  domain: string;
  value: string;
  reason?: string;
}
export interface DomainStatus {
  domain: string;
  verified: boolean;
  records: DomainRecord[];
  /** The A / CNAME the apex or subdomain should point at. */
  target: DomainRecord[];
}

const APEX_RECORDS: DomainRecord[] = [{ type: "A", domain: "@", value: "76.76.21.21" }];
const SUB_RECORDS = (host: string): DomainRecord[] => [
  { type: "CNAME", domain: host, value: "cname.vercel-dns.com" },
];

function isApex(domain: string): boolean {
  return domain.split(".").length === 2;
}

/** projectRef is the Vercel project id, or its name if the id isn't stored. */
export async function addDomain(projectRef: string, domain: string): Promise<DomainStatus> {
  const res = await fetch(url(`/v10/projects/${encodeURIComponent(projectRef)}/domains`), {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ name: domain }),
  });
  const body = await res.json();
  if (!res.ok && body?.error?.code !== "domain_already_in_use_by_this_project") {
    throw new Error(body?.error?.message ?? `Vercel add-domain failed (${res.status})`);
  }
  return getDomainStatus(projectRef, domain);
}

export async function getDomainStatus(projectRef: string, domain: string): Promise<DomainStatus> {
  const res = await fetch(
    url(`/v9/projects/${encodeURIComponent(projectRef)}/domains/${encodeURIComponent(domain)}`),
    { headers: headers() },
  );
  const body = await res.json();
  if (!res.ok) {
    throw new Error(body?.error?.message ?? `Vercel domain-status failed (${res.status})`);
  }
  const records: DomainRecord[] = Array.isArray(body.verification)
    ? body.verification.map((v: Record<string, string>) => ({
        type: v.type,
        domain: v.domain,
        value: v.value,
        reason: v.reason,
      }))
    : [];
  const host = domain.split(".").slice(0, -2).join(".") || "www";
  return {
    domain,
    verified: Boolean(body.verified),
    records,
    target: isApex(domain) ? APEX_RECORDS : SUB_RECORDS(host),
  };
}

export async function removeDomain(projectRef: string, domain: string): Promise<void> {
  await fetch(
    url(`/v9/projects/${encodeURIComponent(projectRef)}/domains/${encodeURIComponent(domain)}`),
    { method: "DELETE", headers: headers() },
  );
}

const DOMAIN_RE = /^(?!-)[a-z0-9-]{1,63}(?<!-)(\.(?!-)[a-z0-9-]{1,63}(?<!-))+$/i;

export function isValidDomain(input: string): boolean {
  const d = input.trim().toLowerCase();
  return DOMAIN_RE.test(d) && !d.endsWith(".vercel.app") && d.length <= 253;
}
