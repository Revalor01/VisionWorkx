import { NextRequest, NextResponse, after } from "next/server";
import { createServerClient, createServiceClient } from "@/lib/supabase";
import { isAdmin } from "@/lib/social/authGuard";
import { generateContentVideo } from "@/lib/social/videoGenerator";
import { appendBrandOutro } from "@/lib/social/videoOutro";

export const runtime = "nodejs";
export const maxDuration = 300;

const BUCKET = "social-video-assets";

// Kling generation routinely runs 2-4 minutes, which is longer than a
// client connection (or the platform's gateway) stays open — a prior
// version awaited the whole thing inline and every TikTok/YouTube video
// generation eventually died with a 504 the frontend couldn't parse as
// JSON, surfacing as "nothing happens". Instead: create the asset row and
// respond immediately, then keep generating in the background via
// after() (still bounded by maxDuration) and update the row's status when
// it finishes. The frontend polls GET .../video-assets/[id] for status.
export async function POST(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!isAdmin(user)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Optional override for which brand's identity the video is generated
  // under - e.g. a TikTok post's own brand_id is whichever row owns the
  // connected account (see connectedPlatforms.tiktokContentOverride), but
  // that's not necessarily the identity the video itself should look/sound
  // like, so the admin UI lets this be picked separately.
  let videoBrandId: string | undefined;
  try {
    const body = await req.json();
    videoBrandId = body?.brandId || undefined;
  } catch {
    // no body sent - fall back to the post's own brand below
  }

  const service = createServiceClient();
  const { data: post } = await service.from("social_content").select("*").eq("id", params.id).maybeSingle();
  if (!post) return NextResponse.json({ error: "Content not found" }, { status: 404 });

  const brandId = videoBrandId || post.brand_id;
  const { data: brand } = await service.from("social_brands").select("name, voice_notes").eq("id", brandId).maybeSingle();
  if (!brand) return NextResponse.json({ error: "Brand not found" }, { status: 404 });

  const assetId = crypto.randomUUID();
  const path = `${brandId}/generated/${assetId}.mp4`;

  const { data: asset, error: insertError } = await service
    .from("social_video_assets")
    .insert({
      id: assetId,
      brand_id: brandId,
      raw_path: path,
      status: "generating",
      notes: "AI-generated (Kling v2.6) from this post's caption",
    })
    .select("*")
    .single();
  if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 });

  const { error: updateError } = await service
    .from("social_content")
    .update({ video_asset_id: asset.id, updated_at: new Date().toISOString() })
    .eq("id", post.id);
  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });

  after(async () => {
    try {
      const video = await generateContentVideo({
        brandName: brand.name,
        brandVoiceNotes: brand.voice_notes,
        hook: post.hook,
        caption: post.caption,
      });

      // Appends a brand + Revalor logo end-card so the finished clip makes
      // clear it's promoting a Revalor software product, not just abstract
      // b-roll. Best-effort — falls back to the raw clip on any failure.
      const bytes = await appendBrandOutro(Buffer.from(video.bytes), brand.name);
      const { error: uploadError } = await service.storage
        .from(BUCKET)
        .upload(path, bytes, { contentType: video.mediaType || "video/mp4", upsert: true });
      if (uploadError) throw new Error(uploadError.message);

      await service
        .from("social_video_assets")
        .update({ status: "ready", final_path: path, updated_at: new Date().toISOString() })
        .eq("id", assetId);
    } catch (err) {
      await service
        .from("social_video_assets")
        .update({
          status: "failed",
          notes: `Generation failed: ${(err as Error).message}`,
          updated_at: new Date().toISOString(),
        })
        .eq("id", assetId);
    }
  });

  return NextResponse.json({ ok: true, asset }, { status: 202 });
}
