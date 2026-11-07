// HARD RULE (owner, 2026-11-07): every social post names its product up front and
// links to that product's own page — never just the brand. Enforced in publishPost
// right before anything goes out (autopilot, Renaissance, batch or manual), so no
// caller can skip it. A post whose product can't be worked out is blocked. Pure.

export const PRODUCTS_SITE = "https://products.revalorllc.com";

/** Every product the posts can promote: its display name and products-site section. */
export const POST_PRODUCTS: Record<string, { name: string; section: "business" | "wellness" | "kids"; aliases?: string[] }> = {
  sanctum: { name: "Sanctum", section: "wellness" },
  elevate: { name: "Elevate", section: "wellness" },
  visionworkx: { name: "VisionWorkx", section: "business", aliases: ["vision workx"] },
  proactive: { name: "Proactive", section: "business" },
  consulting: { name: "Revalor Consulting", section: "business", aliases: ["revalor_consulting"] },
  chorebit: { name: "Chorebit", section: "kids" },
  feelflow: { name: "FeelFlow", section: "kids" },
  mindbit: { name: "MindBit", section: "kids" },
};

/** Products each brand speaks for (Renaissance / products-site slugs). */
export const BRAND_POST_PRODUCTS: Record<string, string[]> = {
  VisionWorkx: ["visionworkx"],
  "Revalor LLC": ["visionworkx", "proactive", "consulting"],
  "Revalor Kids": ["chorebit", "feelflow", "mindbit"],
  "Revalor Wellness": ["sanctum", "elevate"],
};

/** How much of a caption Facebook/Instagram show before "See more". */
export const VISIBLE_CHARS = 125;

const slugOf = (s: string) => (s === "revalor_consulting" ? "consulting" : s);

export function productPage(slug: string): string {
  const p = POST_PRODUCTS[slug];
  return p ? `${PRODUCTS_SITE}/${p.section}#${slug}` : PRODUCTS_SITE;
}

function mentions(text: string, slug: string): boolean {
  const p = POST_PRODUCTS[slug];
  if (!p) return false;
  const t = text.toLowerCase();
  // "Revalor Consulting" also counts when written as just "Consulting" next to Revalor.
  const names = [p.name, ...(p.aliases ?? []), ...(slug === "consulting" ? ["consulting"] : [])];
  return names.some((n) => new RegExp(`\\b${n.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`).test(t));
}

/** The product a link points at: a products-site #fragment, or a <product>.revalorllc.com host. */
export function productOfUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    const frag = slugOf(decodeURIComponent(u.hash.replace(/^#/, "")).toLowerCase());
    if (POST_PRODUCTS[frag]) return frag;
    const sub = u.hostname.split(".")[0].toLowerCase();
    if (u.hostname.endsWith("revalorllc.com") && POST_PRODUCTS[sub]) return sub;
    return null;
  } catch {
    return null;
  }
}

/**
 * Which product a post is about: its link's product, else the first of the brand's
 * products it names (earliest in the text), else the brand's only product, else any
 * product it names. null = can't tell, so the post must not go out.
 */
export function resolvePostProduct(post: { link_url: string | null; hook: string | null; caption: string }, brandName: string): string | null {
  const fromLink = productOfUrl(post.link_url);
  if (fromLink) return fromLink;
  const text = `${post.hook ?? ""}\n${post.caption}`;
  const firstNamed = (slugs: string[]) =>
    slugs
      .map((s) => ({ s, i: mentions(text, s) ? text.toLowerCase().indexOf(POST_PRODUCTS[s].name.toLowerCase().split(" ").pop()!) : -1 }))
      .filter((x) => x.i >= 0)
      .sort((a, b) => a.i - b.i)[0]?.s ?? null;
  const own = BRAND_POST_PRODUCTS[brandName] ?? [];
  return firstNamed(own) ?? (own.length === 1 ? own[0] : null) ?? firstNamed(Object.keys(POST_PRODUCTS));
}

export type ProductRuleResult =
  | { ok: true; product: string; name: string; link: string; caption: string; hook: string | null }
  | { ok: false; reason: string };

/**
 * Applies the rule: the post's link becomes its product's page (unless it already
 * points at that product), the product is named in what people see first (the
 * video title for videos, the first ~125 characters of the caption for everything),
 * and the caption names the product. Never invents a product.
 */
export function applyProductRule(post: { link_url: string | null; hook: string | null; caption: string; video: boolean }, brandName: string): ProductRuleResult {
  const product = resolvePostProduct(post, brandName);
  if (!product) return { ok: false, reason: "the post doesn't name a Revalor product, so it can't link to one. Every post must promote a specific product." };
  const { name } = POST_PRODUCTS[product];
  const link = productOfUrl(post.link_url) === product ? post.link_url! : productPage(product);

  let hook = post.hook;
  // A video goes out with its hook as the title — the first thing people read.
  if (post.video && hook && !mentions(hook, product)) hook = `${name}: ${hook}`;

  let caption = post.caption;
  if (!mentions(caption.slice(0, VISIBLE_CHARS), product)) caption = `${name} — try it free.\n\n${caption}`;
  return { ok: true, product, name, link, caption, hook };
}
