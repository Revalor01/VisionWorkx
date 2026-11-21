import "server-only";
import { createHmac } from "node:crypto";
import { EMPTY_NAV, REVALOR_ADMIN, localizeNav, type RevalorNav } from "./revalorNav";

// Server-only: reads revalor-admin's GET /api/nav, proving it shares
// ADMIN_SSO_SECRET with an HMAC (the secret itself never travels).

/** Fetch the nav (cached 5 min). Never throws: on any failure the bar still
 *  renders, with just the wordmark and the way back to Revalor Admin. */
export async function loadRevalorNav(): Promise<RevalorNav> {
  const secret = process.env.ADMIN_SSO_SECRET;
  if (!secret) return EMPTY_NAV;
  try {
    const res = await fetch(`${REVALOR_ADMIN}/api/nav`, {
      headers: { "x-nav-key": createHmac("sha256", secret).update("revalor-nav").digest("hex") },
      next: { revalidate: 300 },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return localizeNav((await res.json()) as RevalorNav);
  } catch (err) {
    console.error("[admin] Revalor nav fetch failed:", err instanceof Error ? err.message : err);
    return EMPTY_NAV;
  }
}
