import { NextRequest, NextResponse, after } from "next/server";
import { createServerClient, createServiceClient } from "@/lib/supabase";
import { isAdmin } from "@/lib/social/authGuard";
import { generateContentVideo } from "@/lib/social/videoGenerator";
import { appendBrandOutro } from "@/lib/social/videoOutro";

export const runtime = "nodejs";
export const maxDuration = 300;

const BUCKET = "social-video-assets";
const REVALOR_LLC_BRAND_NAME = "Revalor LLC";

// Mirrors app/api/social/content/[id]/generate-video's async pattern (see
// that file's comment for why: Kling takes 2-4 min, longer than a client
// connection stays open). LinkedIn posts always represent Revalor LLC, so
// unlike the multi-brand content route there's no brand picker here.
export async function POST(_req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!isAdmin(user)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const service = createServiceClient();
  const { data: post } = await service.from("linkedin_posts").select("*").eq("id", params.id).maybeSingle();
  if (!post) return NextResponse.json({ error: "Post not found" }, { status: 404 });

  const { data: brand } = await service.from("social_brands").select("id, name, voice_notes").eq("name", REVALOR_LLC_BRAND_NAME).maybeSingle();
  if (!brand) return NextResponse.json({ error: "Revalor LLC brand not found" }, { status: 404 });

  const assetId = crypto.randomUUID();
  const path = `${brand.id}/generated/${assetId}.mp4`;

  const { data: asset, error: insertError } = await service
    .from("social_video_assets")
    .insert({
      id: assetId,
      brand_id: brand.id,
      raw_path: path,
      status: "generating",
      notes: "AI-generated (Kling v2.6) for LinkedIn post",
    })
    .select("*")
    .single();
  if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 });

  const { error: updateError } = await service
    .from("linkedin_posts")
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
