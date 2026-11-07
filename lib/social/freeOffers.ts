// Every product with a free way in (a free plan or a free trial) promotes it in
// every social post. The offers come from revalor-admin's /pricing feed (the
// editable source of truth), falling back to a snapshot if it can't be read.

export const PRICING_FEED_URL = "https://revalor-admin.vercel.app/api/public/pricing";

type FeedProduct = { slug?: unknown; name?: unknown; trial?: unknown; tiers?: unknown };

/** The product's free offer in plain words, or null if it has none. Pure. */
export function freeOfferFrom(p: FeedProduct): string | null {
  const trial = typeof p.trial === "string" ? p.trial.trim() : "";
  if (trial) return /free/i.test(trial) ? trial : trial.replace(/\btrial\b/i, "free trial");
  const tiers = Array.isArray(p.tiers) ? (p.tiers as { name?: unknown; monthly?: unknown; price?: unknown }[]) : [];
  const free = tiers.find((t) => t.monthly === 0 || (typeof t.price === "string" && /^\$0(\.00)?\b/.test(t.price)));
  return free ? `a free plan (${typeof free.name === "string" ? free.name : "Free"}, $0)` : null;
}

export type FreeOffers = Record<string, { name: string; offer: string }>;

/** Feed body → slug → offer, for products that have one. Pure. */
export function parseFreeOffers(body: unknown): FreeOffers | null {
  const products = (body as { products?: unknown } | null)?.products;
  if (!Array.isArray(products)) return null;
  const out: FreeOffers = {};
  for (const p of products as FeedProduct[]) {
    if (typeof p.slug !== "string") continue;
    const offer = freeOfferFrom(p);
    if (offer) out[p.slug] = { name: typeof p.name === "string" ? p.name : p.slug, offer };
  }
  return out;
}

/** Snapshot (2026-11-06) used only when the feed can't be read. */
export const FREE_OFFERS_FALLBACK: FreeOffers = {
  visionworkx: { name: "VisionWorkx Modules", offer: "14-day free trial" },
  chorebit: { name: "Chorebit", offer: "30-day free trial" },
  feelflow: { name: "FeelFlow", offer: "30-day free trial" },
  mindbit: { name: "MindBit", offer: "30-day free trial" },
  proactive: { name: "Proactive", offer: "a free plan (Free, $0)" },
  sanctum: { name: "Sanctum", offer: "a free plan (Free, $0)" },
  elevate: { name: "Elevate", offer: "a free plan (Free, $0)" },
};

export async function loadFreeOffers(): Promise<FreeOffers> {
  try {
    const res = await fetch(PRICING_FEED_URL, { signal: AbortSignal.timeout(5000), cache: "no-store" });
    if (!res.ok) throw new Error(`feed answered ${res.status}`);
    return parseFreeOffers(await res.json()) ?? FREE_OFFERS_FALLBACK;
  } catch (err) {
    console.warn("[freeOffers] pricing feed unavailable, using the snapshot:", (err as Error).message);
    return FREE_OFFERS_FALLBACK;
  }
}

/** The prompt block for the post writer: the offers to promote, or "" when none apply. Pure. */
export function freeOfferInstruction(offers: { name: string; offer: string }[]): string {
  if (!offers.length) return "";
  return `Free offers — every post must invite the reader to try it free, naming the offer exactly as written (never invent other offers, discounts or prices):\n${offers.map((o) => `- ${o.name}: ${o.offer}`).join("\n")}`;
}

/**
 * The plain-text link line for platforms whose captions can't hold a clickable
 * link (Instagram, TikTok): host + path, no protocol, tracking or #fragment. Pure.
 */
export function captionLinkLine(linkTarget: string | null, caption: string): string | null {
  if (!linkTarget) return null;
  try {
    const u = new URL(linkTarget);
    const short = `${u.hostname}${u.pathname === "/" ? "" : u.pathname.replace(/\/$/, "")}`;
    if (caption.includes(u.hostname)) return null;
    return `Learn more: ${short}`;
  } catch {
    return null;
  }
}
