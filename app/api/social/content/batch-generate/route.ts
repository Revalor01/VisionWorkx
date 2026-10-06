import { NextRequest, NextResponse } from "next/server";
import { createServerClient, createServiceClient } from "@/lib/supabase";
import { isAdmin } from "@/lib/social/authGuard";
import { getMediaGenerationSpend } from "@/lib/social/gatewaySpend";
import { estimateBatchCost, remainingBudget, withinBudget, MONTHLY_BUDGET_USD } from "@/lib/social/mediaCost";
import { runBatchGenerate, MAX_BATCH_POSTS } from "@/lib/social/batchGenerate";
import type { SocialBrand } from "@/lib/database.types";

export const runtime = "nodejs";
export const maxDuration = 120; // captions only (one batched Sonnet call per ~14 posts); hero videos render later in the cron

// Operator: queue 7-15 days of content for a brand. `preview: true` returns the
// cost estimate and remaining monthly budget without spending or writing. A real
// run is refused if its estimated media spend would push the month over the cap.
export async function POST(req: NextRequest) {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!isAdmin(user)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: { brandId?: unknown; days?: unknown; perDay?: unknown; videoCount?: unknown; preview?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }

  const brandId = typeof body.brandId === "string" ? body.brandId : "";
  const days = clampInt(body.days, 7, 15);
  const perDay = clampInt(body.perDay, 1, 3);
  const total = Math.min(days * perDay, MAX_BATCH_POSTS);
  const videoCount = clampInt(body.videoCount, 0, total);
  const preview = body.preview === true;

  if (!brandId) return NextResponse.json({ error: "brandId is required" }, { status: 400 });

  // images: up to one auto-image per post (Instagram always; Facebook for
  // image-first brands). An upper bound — cheap next to video, keeps the cap safe.
  const estimate = estimateBatchCost({ posts: total, images: total, videos: videoCount });

  // Month-to-date media spend (Vercel AI Gateway actuals). If the report is
  // briefly unavailable, treat it as spent-to-cap so we fail safe rather than
  // over-spend on a blind run.
  let monthToDate: number | null = null;
  try {
    monthToDate = (await getMediaGenerationSpend(30)).totalCost;
  } catch (err) {
    console.error("[batch-generate] spend lookup failed:", err);
  }
  const effectiveSpend = monthToDate ?? MONTHLY_BUDGET_USD;
  const remaining = remainingBudget(effectiveSpend);

  if (preview) {
    return NextResponse.json({
      preview: true,
      estimate,
      monthToDate,
      remaining,
      cap: MONTHLY_BUDGET_USD,
      spendUnavailable: monthToDate === null,
    });
  }

  if (!withinBudget(effectiveSpend, estimate.totalUsd)) {
    return NextResponse.json(
      {
        error: `This batch's estimated media cost ($${estimate.totalUsd.toFixed(2)}) would exceed the $${MONTHLY_BUDGET_USD.toFixed(0)} monthly cap (already spent $${effectiveSpend.toFixed(2)}). Reduce the hero videos and try again.`,
        estimate,
        monthToDate,
        remaining,
      },
      { status: 400 },
    );
  }

  const service = createServiceClient();
  const { data: brand } = await service.from("social_brands").select("*").eq("id", brandId).maybeSingle();
  if (!brand) return NextResponse.json({ error: "Brand not found" }, { status: 404 });

  const result = await runBatchGenerate(service, brand as SocialBrand, { days, perDay, videoCount });
  return NextResponse.json({ ok: true, result, estimate, monthToDate, remaining });
}

function clampInt(v: unknown, min: number, max: number): number {
  const n = Math.floor(Number(v));
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, n));
}
