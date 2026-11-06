import type { BrandMediaPolicy } from "@/lib/social/brandMediaPolicy";

// Weekly cadence per app (e.g. Revalor Kids: Chorebit, FeelFlow, MindBit each get
// 1 image post per platform per week). social_content has no product column, so a
// post is tagged by its link — the app's own page on the brand's site
// (…/kids#chorebit) — which is also the link Facebook shows. Pure.

const DAY = 86_400_000;

/** The app's page: the brand's site with #<product> (any existing #fragment replaced). */
export function productPageUrl(brandWebsite: string | null, product: string): string | null {
  if (!brandWebsite) return null;
  return `${brandWebsite.split("#")[0]}#${product}`;
}

/** Which product a post is about, from its link's #fragment, if it's one of `products`. */
export function productOfLink(linkUrl: string | null, products: string[]): string | null {
  const frag = linkUrl?.split("#")[1];
  return frag && products.includes(frag) ? frag : null;
}

/**
 * For each product, the platforms that still have room this week: allowed by the
 * policy, connected, and with fewer than postsPerWeek autonomous posts for that
 * product on that platform in the last 7 days. Products with no room are dropped.
 */
export function weeklyProductPlan(
  policy: BrandMediaPolicy,
  products: string[],
  connected: string[],
  recent: { platform: string; link_url: string | null }[],
): { product: string; platforms: string[] }[] {
  const w = policy.weeklyAutopilot;
  if (!w) return [];
  const counts = new Map<string, number>();
  for (const r of recent) {
    const p = productOfLink(r.link_url, products);
    if (p) counts.set(`${p}|${r.platform}`, (counts.get(`${p}|${r.platform}`) ?? 0) + 1);
  }
  const allowed = connected.filter((p) => (w.platforms as string[]).includes(p));
  return products
    .map((product) => ({ product, platforms: allowed.filter((pl) => (counts.get(`${product}|${pl}`) ?? 0) < w.postsPerWeek) }))
    .filter((x) => x.platforms.length > 0);
}

/**
 * When a product's post goes out: each product on its own day (the i-th product
 * `i` days after the first free day), Facebook at 14:00 UTC and Instagram at
 * 17:00 UTC, always in the future.
 */
export function productSlot(productIndex: number, platform: string, now: Date): string {
  const hour = platform === "instagram" ? 17 : 14;
  const first = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 14));
  if (first.getTime() <= now.getTime()) first.setUTCDate(first.getUTCDate() + 1);
  const t = new Date(first.getTime() + productIndex * DAY);
  t.setUTCHours(hour, 0, 0, 0);
  return t.toISOString();
}
