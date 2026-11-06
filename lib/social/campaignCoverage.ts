import type { createServiceClient } from "@/lib/supabase";
import { BRAND_PRODUCTS } from "@/lib/social/productKnowledge";

// Renaissance ↔ Social: while a Renaissance (revalor-admin) campaign is live with
// Social for a product, Social's own daily autopilot (cron social-generate)
// stands down for that product — it doesn't write about it, and a brand whose
// products are ALL covered skips its daily run. Both apps share this database,
// so Social reads Renaissance's permissions (renaissance_mandates) directly.

type Service = ReturnType<typeof createServiceClient>;

/** Social's product keys → Renaissance catalog slugs (the only one that differs is consulting). */
const TO_RENAISSANCE: Record<string, string> = { revalor_consulting: "consulting" };
export const renaissanceSlug = (socialProduct: string) => TO_RENAISSANCE[socialProduct] ?? socialProduct;

export type LiveMandate = { status: string; starts_at: string | null; ends_at: string | null; limits: { social?: unknown } | null; product_slugs: string[] | null };

/** Product slugs with a live Renaissance permission that includes Social. Pure. */
export function coveredProducts(mandates: LiveMandate[], now: Date): Set<string> {
  const out = new Set<string>();
  for (const m of mandates) {
    if (m.status !== "active" || !m.limits?.social) continue;
    if (m.starts_at && new Date(m.starts_at).getTime() > now.getTime()) continue;
    if (m.ends_at && new Date(m.ends_at).getTime() <= now.getTime()) continue;
    for (const s of m.product_slugs ?? []) out.add(s);
  }
  return out;
}

/**
 * What the daily autopilot does for a brand given the covered products: skip the
 * brand when it speaks for products and every one is covered; otherwise write
 * only about the uncovered ones (`exclude` lists the brand's covered product keys). Pure.
 */
export function brandCoverage(brandName: string, covered: Set<string>): { skip: boolean; exclude: string[] } {
  const mine = BRAND_PRODUCTS[brandName] ?? [];
  const exclude = mine.filter((p) => covered.has(renaissanceSlug(p)));
  return { skip: mine.length > 0 && exclude.length === mine.length, exclude };
}

/** Live coverage: the covered Renaissance slugs, and their display names (for the prompt and the dashboard). */
export async function loadCampaignCoverage(service: Service, now = new Date()): Promise<{ covered: Set<string>; names: string[] }> {
  const { data, error } = await service.from("renaissance_mandates").select("status, starts_at, ends_at, limits, product_slugs").eq("status", "active");
  if (error) throw new Error(`Couldn't read Renaissance campaigns: ${error.message}`);
  const covered = coveredProducts((data ?? []) as LiveMandate[], now);
  if (!covered.size) return { covered, names: [] };
  const { data: products } = await service.from("renaissance_products").select("slug, name").in("slug", [...covered]);
  // renaissance_* tables belong to revalor-admin, so they aren't in this repo's generated DB types.
  const nameBySlug = new Map(((products ?? []) as unknown as { slug: string; name: string }[]).map((p) => [p.slug, p.name]));
  return { covered, names: [...covered].map((s) => nameBySlug.get(s) ?? s) };
}
