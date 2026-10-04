import type { createServiceClient } from "@/lib/supabase";
import type { SocialContent } from "@/lib/database.types";
import { generateContentImage } from "@/lib/social/imageGenerator";

// Generates a post's image, uploads it to social-content-images and saves
// image_path. Shared by the dashboard's Generate image button and the
// /api/cron/social-images job.

const BUCKET = "social-content-images";

function extFor(mediaType: string): string {
  if (mediaType.includes("png")) return "png";
  if (mediaType.includes("webp")) return "webp";
  return "jpg";
}

export async function generateAndSavePostImage(
  service: ReturnType<typeof createServiceClient>,
  post: Pick<SocialContent, "id" | "brand_id" | "hook" | "caption" | "platform">
): Promise<{ path: string; base64: string; mediaType: string }> {
  const { data: brand } = await service.from("social_brands").select("name, voice_notes").eq("id", post.brand_id).maybeSingle();
  if (!brand) throw new Error("Brand not found");

  const image = await generateContentImage({
    brandName: brand.name,
    brandVoiceNotes: brand.voice_notes,
    hook: post.hook,
    caption: post.caption,
    platform: post.platform,
  });

  const path = `${post.brand_id}/${post.id}.${extFor(image.mediaType)}`;
  const { error: uploadError } = await service.storage
    .from(BUCKET)
    .upload(path, Buffer.from(image.base64, "base64"), { contentType: image.mediaType, upsert: true });
  if (uploadError) throw new Error(uploadError.message);

  const { error: updateError } = await service
    .from("social_content")
    .update({ image_path: path, updated_at: new Date().toISOString() })
    .eq("id", post.id);
  if (updateError) throw new Error(updateError.message);

  return { path, base64: image.base64, mediaType: image.mediaType };
}

// After an automatic image lands: an Instagram (or other media-only) draft
// that was waiting on it becomes scheduled; anything else keeps its status.
export function statusAfterAutoImage(status: SocialContent["status"]): SocialContent["status"] {
  return status === "draft" || status === "approved" ? "scheduled" : status;
}
