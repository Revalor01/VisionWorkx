import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";
import { generateContentVideo } from "@/lib/social/videoGenerator";
import { appendBrandOutro } from "@/lib/social/videoOutro";
import { getMediaGenerationSpend } from "@/lib/social/gatewaySpend";
import { VIDEO_USD, MONTHLY_BUDGET_USD, withinBudget } from "@/lib/social/mediaCost";
import { BATCH_HERO_NOTE } from "@/lib/social/batchGenerate";

export const runtime = "nodejs";
export const maxDuration = 300; // one Kling render (~2-4 min) + outro per run

const BUCKET = "social-video-assets";

// Renders ONE queued batch "hero" video per run (they're days out, so a slow
// drain is fine), under the monthly media budget cap. On success the asset
// becomes `ready` and its post flips from draft to scheduled; on failure the
// asset is marked `failed` and the post stays a draft for the operator.
export async function GET(req: NextRequest) {
  if ((req.headers.get("authorization") ?? "") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Budget gate — never render if the next clip would push the month over cap.
  let monthToDate: number;
  try {
    monthToDate = (await getMediaGenerationSpend(30)).totalCost;
  } catch (err) {
    console.error("[social-video-worker] spend lookup failed:", err);
    return NextResponse.json({ skipped: "spend lookup failed" });
  }
  if (!withinBudget(monthToDate, VIDEO_USD)) {
    return NextResponse.json({ skipped: "budget", monthToDate, cap: MONTHLY_BUDGET_USD });
  }

  const service = createServiceClient();
  const { data: asset } = await service
    .from("social_video_assets")
    .select("id, brand_id, raw_path")
    .eq("status", "generating")
    .eq("notes", BATCH_HERO_NOTE)
    .is("final_path", null)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (!asset) return NextResponse.json({ done: true, message: "no queued hero videos" });

  const { data: post } = await service
    .from("social_content")
    .select("id, hook, caption, status")
    .eq("video_asset_id", asset.id)
    .limit(1)
    .maybeSingle();
  const { data: brand } = await service.from("social_brands").select("name, voice_notes").eq("id", asset.brand_id).maybeSingle();
  if (!brand) {
    await service.from("social_video_assets").update({ status: "failed", notes: "Brand not found", updated_at: new Date().toISOString() }).eq("id", asset.id);
    return NextResponse.json({ error: "brand not found", assetId: asset.id }, { status: 200 });
  }

  try {
    const video = await generateContentVideo({
      brandName: brand.name,
      brandVoiceNotes: brand.voice_notes,
      hook: post?.hook ?? null,
      caption: post?.caption ?? "",
    });
    const bytes = await appendBrandOutro(Buffer.from(video.bytes), brand.name);
    const { error: uploadError } = await service.storage
      .from(BUCKET)
      .upload(asset.raw_path, bytes, { contentType: video.mediaType || "video/mp4", upsert: true });
    if (uploadError) throw new Error(uploadError.message);

    await service
      .from("social_video_assets")
      .update({ status: "ready", final_path: asset.raw_path, notes: "Batch hero video", updated_at: new Date().toISOString() })
      .eq("id", asset.id);

    // Flip the linked post to scheduled now that its video exists.
    if (post && post.status === "draft") {
      await service.from("social_content").update({ status: "scheduled", updated_at: new Date().toISOString() }).eq("id", post.id).eq("status", "draft");
    }
    return NextResponse.json({ ok: true, assetId: asset.id, postScheduled: post?.status === "draft" });
  } catch (err) {
    await service
      .from("social_video_assets")
      .update({ status: "failed", notes: `Generation failed: ${(err as Error).message}`, updated_at: new Date().toISOString() })
      .eq("id", asset.id);
    return NextResponse.json({ error: (err as Error).message, assetId: asset.id }, { status: 200 });
  }
}
