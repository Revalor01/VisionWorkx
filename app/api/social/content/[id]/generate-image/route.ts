import { NextRequest, NextResponse } from "next/server";
import { createServerClient, createServiceClient } from "@/lib/supabase";
import { isAdmin } from "@/lib/social/authGuard";
import { generateContentImage } from "@/lib/social/imageGenerator";

const BUCKET = "social-content-images";

function extFor(mediaType: string): string {
  if (mediaType.includes("png")) return "png";
  if (mediaType.includes("webp")) return "webp";
  return "jpg";
}

export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createServerClient();
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
    const image = await generateContentImage({
      brandName: brand.name,
      brandVoiceNotes: brand.voice_notes,
      hook: post.hook,
      caption: post.caption,
      platform: post.platform,
    });

    const ext = extFor(image.mediaType);
    const path = `${post.brand_id}/${post.id}.${ext}`;
    const bytes = Buffer.from(image.base64, "base64");

    const { error: uploadError } = await service.storage
      .from(BUCKET)
      .upload(path, bytes, { contentType: image.mediaType, upsert: true });
    if (uploadError) return NextResponse.json({ error: uploadError.message }, { status: 500 });

    const { error: updateError } = await service
      .from("social_content")
      .update({ image_path: path, updated_at: new Date().toISOString() })
      .eq("id", post.id);
    if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });

    return NextResponse.json({ ok: true, imagePath: path, dataUrl: `data:${image.mediaType};base64,${image.base64}` });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
