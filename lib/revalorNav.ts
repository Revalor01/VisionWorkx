import { createHmac } from "node:crypto";

// The Revalor admin navigation, read live from revalor-admin's GET /api/nav so
// VisionWorkx's /admin pages draw the exact same blue top bar as revalor-admin
// (sections A–Z with flyout tabs, Quick Access) without a second copy of the
// link list. revalor-admin's app/AdminNavBar.tsx is the one source of truth.

export const REVALOR_ADMIN = "https://revalor-admin.vercel.app";

export type NavSubLink = { key: string; label: string; href: string };
export type NavLink = { key: string; label: string; href: string; sub?: NavSubLink[] };
export type NavCategory = { key: string; label: string; hex: string; links: NavLink[] };
export type QuickLink = { key: string; label: string; href: string; color: string; ring?: string; external?: boolean; row?: 2 };
export type RevalorNav = { categories: NavCategory[]; quick: QuickLink[] };

const EMPTY: RevalorNav = { categories: [], quick: [] };

/** Where a revalor-admin href points from inside VisionWorkx: its own pages
 *  (an SSO hop to target=visionworkx) become local paths, other revalor-admin
 *  pages become absolute links there, and outside sites stay as they are. */
export function localHref(href: string): string {
  if (href.startsWith("/api/admin/sso/issue?")) {
    const params = new URLSearchParams(href.slice(href.indexOf("?") + 1));
    const next = params.get("next");
    if (params.get("target") === "visionworkx" && next?.startsWith("/") && !next.startsWith("//")) return next;
    return `${REVALOR_ADMIN}${href}`;
  }
  if (href.startsWith("/")) return `${REVALOR_ADMIN}${href}`;
  return href;
}

/** The nav with every href already made right for VisionWorkx. */
export function localizeNav(nav: RevalorNav): RevalorNav {
  return {
    categories: nav.categories.map((c) => ({
      ...c,
      links: c.links.map((l) => ({ ...l, href: localHref(l.href), sub: l.sub?.map((s) => ({ ...s, href: localHref(s.href) })) })),
    })),
    quick: nav.quick.map((q) => ({ ...q, href: localHref(q.href) })),
  };
}

/** The section a VisionWorkx page belongs to: the longest local (/admin…) link
 *  or flyout tab matching its path. Null for pages in no section. */
export function sectionForPath(nav: RevalorNav, pathname: string): { category: NavCategory; current: string } | null {
  let best: { category: NavCategory; current: string; len: number } | null = null;
  for (const category of nav.categories) {
    for (const link of category.links) {
      for (const href of [link.href, ...(link.sub ?? []).map((s) => s.href)]) {
        if (!href.startsWith("/")) continue;
        const path = href.split("?")[0];
        if ((pathname === path || pathname.startsWith(`${path}/`)) && (!best || path.length > best.len)) {
          best = { category, current: link.key, len: path.length };
        }
      }
    }
  }
  return best && { category: best.category, current: best.current };
}

/** Fetch the nav (cached 5 min). Never throws: on any failure the bar still
 *  renders, with just the wordmark and the way back to Revalor Admin. */
export async function loadRevalorNav(): Promise<RevalorNav> {
  const secret = process.env.ADMIN_SSO_SECRET;
  if (!secret) return EMPTY;
  try {
    const res = await fetch(`${REVALOR_ADMIN}/api/nav`, {
      headers: { "x-nav-key": createHmac("sha256", secret).update("revalor-nav").digest("hex") },
      next: { revalidate: 300 },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return localizeNav((await res.json()) as RevalorNav);
  } catch (err) {
    console.error("[admin] Revalor nav fetch failed:", err instanceof Error ? err.message : err);
    return EMPTY;
  }
}
