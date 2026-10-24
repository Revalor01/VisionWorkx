import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";
import { publishPost } from "@/lib/social/publishPost";
import { raiseAutonomyFlag } from "@/lib/social/autonomyFlags";
import { holdPaused, pickPublishable } from "@/lib/social/publishSpacing";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization") ?? "";
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const service = createServiceClient();

  const { data: due } = await service
    .from("social_content")
    .select("*")
    .eq("status", "scheduled")
    .lte("scheduled_at", new Date().toISOString());

  // At most one Facebook post per Page per run (lib/social/publishSpacing.ts);
  // the rest stay scheduled and go out on the next run, 10 minutes later.
  const brandIds = [...new Set((due ?? []).map((p) => p.brand_id))];
  const { data: brands, error: brandsErr } = brandIds.length ? await service.from("social_brands").select("id, fb_page_id, autonomy_paused_at").in("id", brandIds) : { data: [], error: null };
  if (brandsErr) return NextResponse.json({ error: brandsErr.message }, { status: 500 });
  const pageOf = new Map((brands ?? []).map((b) => [b.id, b.fb_page_id]));
  const paused = new Set((brands ?? []).filter((b) => b.autonomy_paused_at).map((b) => b.id));
  // Automatic posts of a paused brand stay scheduled until it's resumed (lib/social/publishSpacing.ts).
  const { go, held } = holdPaused(due ?? [], (brandId) => paused.has(brandId));
  const { now, deferred } = pickPublishable(go, (brandId) => pageOf.get(brandId));

  const results: { id: string; ok: boolean; error?: string }[] = [];

  for (const post of now) {
    const result = await publishPost(service, post);
    results.push({ id: post.id, ...result });

    if (!result.ok) {
      const { data: brand } = await service.from("social_brands").select("name").eq("id", post.brand_id).maybeSingle();
      await raiseAutonomyFlag(service, {
        brandId: post.brand_id,
        brandName: brand?.name ?? "Unknown brand",
        contentId: post.id,
        kind: "publish_failure",
        detail: `Failed to publish ${post.platform} post: ${result.error ?? "unknown error"}`,
      });
    }
  }

  return NextResponse.json({ processed: results.length, deferred: deferred.map((p) => p.id), held: held.map((p) => p.id), results });
}
