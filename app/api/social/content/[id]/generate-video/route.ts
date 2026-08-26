import { NextRequest, NextResponse } from "next/server";
import { createServerClient, createServiceClient } from "@/lib/supabase";
import { isAdmin } from "@/lib/social/authGuard";
import { generateContentVideo } from "@/lib/social/videoGenerator";

export const runtime = "nodejs";
export const maxDuration = 300;

const BUCKET = "social-video-assets";

export async function POST(_req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!isAdmin(user)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const service = createServiceClient();
  const { data: post } = await service.from("social_content").select("*").eq("id", params.id).maybeSingle();
  if (!post) return NextResponse.json({ error: "Content not found" }, { status: 404 });

  const { data: brand } = await service.from("social_brands").select("name, voice_notes").eq("id", post.brand_id).maybeSingle();
  if (!brand) return NextResponse.json({ error: "Brand not found" }, { status: 404 });

  try {
    const video = await generateContentVideo({
      brandName: brand.name,
      brandVoiceNotes: brand.voice_notes,
      hook: post.hook,
      caption: post.caption,
    });

    const path = `${post.brand_id}/generated/${post.id}.mp4`;
    const bytes = Buffer.from(video.bytes);

    const { error: uploadError } = await service.storage
      .from(BUCKET)
      .upload(path, bytes, { contentType: video.mediaType || "video/mp4", upsert: true });
    if (uploadError) return NextResponse.json({ error: uploadError.message }, { status: 500 });

    const { data: asset, error: insertError } = await service
      .from("social_video_assets")
      .insert({
        brand_id: post.brand_id,
        raw_path: path,
        final_path: path,
        status: "ready",
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

    return NextResponse.json({ ok: true, asset });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
