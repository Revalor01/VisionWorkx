import type { SupabaseClient } from "@supabase/supabase-js";
import type { createServiceClient } from "@/lib/supabase";
import type { SocialPlatform, Database } from "@/lib/database.types";

type Service = ReturnType<typeof createServiceClient>;
type SocialContentInsert = Database["public"]["Tables"]["social_content"]["Insert"];

// rv_* tables (rv_competitor_post_ideas, rv_competitors) belong to revalor-admin
// — its migrations live in that repo, so they are not in this repo's generated
// Database types. They live in the SAME shared Supabase project, so we read and
// write them through the same service-role client, via an untyped handle rather
// than copying revalor-admin's schema into this repo.
function rvTables(service: Service): SupabaseClient {
  return service as unknown as SupabaseClient;
}

// Competitor Watch (revalor-admin) tags each post idea with the product it
// came from. Revalor Social's brands are grouped, not one-per-product
// (see lib/social/productKnowledge.ts BRAND_PRODUCTS), so we map each
// product to the social_brands row that speaks for it. `tessa` is Sanctum's
// AI companion, so it rides with the Sanctum / Wellness brand. Anything we
// don't recognise falls back to the company brand.
export const COMPETITOR_FALLBACK_BRAND = "Revalor LLC";

export const PRODUCT_TO_BRAND_NAME: Record<string, string> = {
  visionworkx: "VisionWorkx",
  proactive: "Revalor LLC",
  sanctum: "Revalor Wellness",
  tessa: "Revalor Wellness",
  chorebit: "Revalor Kids",
  feelflow: "Revalor Kids",
  mindbit: "Revalor Kids",
};

export function brandNameForProduct(product: string): string {
  return PRODUCT_TO_BRAND_NAME[product] ?? COMPETITOR_FALLBACK_BRAND;
}

// Does the generated copy name any tracked competitor? Word-boundary match so
// "Calm" doesn't trip on "becalmed"; case-insensitive. Returns the matched
// names joined for display, or null when nothing matched. Never blocks an
// import — competitor-watch drafts are manual-approval regardless — it only
// surfaces a review flag.
export function flagCompetitorMention(copy: string, competitorNames: string[]): string | null {
  const seen: string[] = [];
  for (const raw of competitorNames) {
    const name = raw.trim();
    if (!name) continue;
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    // Require a boundary only where the name itself has a word char at that
    // edge — otherwise \b never matches names like ".NET", "C++" or "Calm!",
    // where the outer char is already non-word. (?<![\w]) / (?![\w]) stand in
    // for a boundary at word-char edges and are satisfied by string ends.
    const left = /^\w/.test(name) ? "(?<!\\w)" : "";
    const right = /\w$/.test(name) ? "(?!\\w)" : "";
    const re = new RegExp(`${left}${escaped}${right}`, "i");
    if (re.test(copy) && !seen.includes(name)) seen.push(name);
  }
  return seen.length > 0 ? seen.join(", ") : null;
}

// Shape of the rows we read from revalor-admin's table (same shared Supabase
// project). Defined locally — this repo must not own or regenerate that
// schema (its migrations live in the revalor-admin repo).
export type CompetitorPostIdea = {
  id: string;
  product: string;
  hook: string;
  angle: string;
  suggested_platform: SocialPlatform;
};

export type PlannedImport = { ideaId: string; product: string; payload: SocialContentInsert };
export type SkippedImport = { ideaId: string; product: string; reason: string };
export type CompetitorImportPlan = { inserts: PlannedImport[]; skipped: SkippedImport[] };

// Pure: turn ready ideas into social_content draft payloads. Every payload is a
// DRAFT (autonomy dial bypassed — STEP 2 forces manual approval for these), in
// the brand the idea's product maps to, flagged when the copy names a tracked
// competitor. An idea whose brand has no social_brands row is skipped, not
// dropped silently. `brandIdByName` and `namesByProduct` are read once from the
// DB by the caller; keeping the decision here makes it unit-testable without a
// database, matching lib/social/batchGenerate planPost.
export function planCompetitorImport(
  ideas: CompetitorPostIdea[],
  brandIdByName: Map<string, string>,
  namesByProduct: Map<string, string[]>
): CompetitorImportPlan {
  const plan: CompetitorImportPlan = { inserts: [], skipped: [] };

  for (const idea of ideas) {
    const brandName = brandNameForProduct(idea.product);
    const brandId = brandIdByName.get(brandName);
    if (!brandId) {
      plan.skipped.push({ ideaId: idea.id, product: idea.product, reason: `No social_brands row named "${brandName}"` });
      continue;
    }

    const copy = [idea.hook, idea.angle].filter(Boolean).join(" ");
    const competitorFlag = flagCompetitorMention(copy, namesByProduct.get(idea.product) ?? []);

    plan.inserts.push({
      ideaId: idea.id,
      product: idea.product,
      payload: {
        brand_id: brandId,
        platform: idea.suggested_platform,
        hook: idea.hook,
        caption: idea.angle,
        status: "draft",
        generated_by: "autonomous",
        source: "competitor_watch",
        source_idea_id: idea.id,
        competitor_flag: competitorFlag,
      },
    });
  }

  return plan;
}

export type CompetitorIntakeResult = { imported: number; flagged: number; skipped: SkippedImport[] };

// Pull every Competitor Watch idea marked ready-for-social that hasn't already
// become a draft, and create one social_content DRAFT per idea in the mapped
// brand. Idempotent — the idea's social_content_id back-link and the unique
// index on social_content.source_idea_id both stop a second run from importing
// the same idea twice.
export async function importCompetitorIdeas(service: Service): Promise<CompetitorIntakeResult> {
  const rv = rvTables(service);

  const { data: ideas, error: ideasError } = await rv
    .from("rv_competitor_post_ideas")
    .select("id, product, hook, angle, suggested_platform")
    .eq("status", "sent_to_social")
    .is("social_content_id", null)
    .order("created_at", { ascending: true })
    .returns<CompetitorPostIdea[]>();
  if (ideasError) throw new Error(`Reading competitor post ideas: ${ideasError.message}`);
  if (!ideas || ideas.length === 0) return { imported: 0, flagged: 0, skipped: [] };

  const { data: brands, error: brandsError } = await service.from("social_brands").select("id, name");
  if (brandsError) throw new Error(`Reading social_brands: ${brandsError.message}`);
  const brandIdByName = new Map((brands ?? []).map((b) => [b.name, b.id]));

  const { data: competitors, error: compError } = await rv
    .from("rv_competitors")
    .select("product, name")
    .eq("active", true)
    .returns<{ product: string; name: string }[]>();
  if (compError) throw new Error(`Reading rv_competitors: ${compError.message}`);
  const namesByProduct = new Map<string, string[]>();
  for (const c of competitors ?? []) {
    const list = namesByProduct.get(c.product) ?? [];
    list.push(c.name);
    namesByProduct.set(c.product, list);
  }

  const plan = planCompetitorImport(ideas, brandIdByName, namesByProduct);
  const result: CompetitorIntakeResult = { imported: 0, flagged: 0, skipped: [...plan.skipped] };

  for (const { ideaId, product, payload } of plan.inserts) {
    const { data: inserted, error: insertError } = await service
      .from("social_content")
      .insert(payload)
      .select("id")
      .single();
    if (insertError) {
      // Unique-index hit = already imported by a concurrent/earlier run; skip quietly.
      result.skipped.push({ ideaId, product, reason: insertError.message });
      continue;
    }

    // Back-link the idea to the draft it became — the "consumed" marker
    // Competitor Watch designed for (rv_competitor_post_ideas.social_content_id).
    const { error: linkError } = await rv
      .from("rv_competitor_post_ideas")
      .update({ social_content_id: inserted.id, updated_at: new Date().toISOString() })
      .eq("id", ideaId);
    if (linkError) {
      // The draft exists and the unique index still guards re-import, so this is
      // not fatal: no duplicate draft is ever created. The idea keeps a null
      // social_content_id, so a later run will retry the back-link (the insert
      // is skipped by the unique index) until it succeeds — recorded here so the
      // operator can see it, not a data-integrity problem.
      result.skipped.push({ ideaId, product, reason: `Draft created but back-link failed: ${linkError.message}` });
    }

    result.imported++;
    if (payload.competitor_flag) result.flagged++;
  }

  return result;
}
