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

// Failed automatic tries allowed before the job gives up on a post.
export const MAX_AUTO_IMAGE_ATTEMPTS = 3;

// What a failed automatic try writes: one more attempt, and auto_image off
// once the limit is reached so the post shows "needs an image" again.
export function afterFailedAutoImage(attempts: number): { auto_image_attempts: number; auto_image?: false } {
  const next = attempts + 1;
  return next >= MAX_AUTO_IMAGE_ATTEMPTS ? { auto_image_attempts: next, auto_image: false } : { auto_image_attempts: next };
}

// The production address the cron calls back into (see /api/internal/social-image).
// Vercel's production domain skips deployment protection; falls back to the app URL.
export function internalBaseUrl(env: Record<string, string | undefined> = process.env): string {
  const prod = env.VERCEL_PROJECT_PRODUCTION_URL;
  if (prod) return `https://${prod.replace(/^https?:\/\//, "").replace(/\/$/, "")}`;
  return (env.NEXT_PUBLIC_APP_URL ?? "https://vision-workx.vercel.app").replace(/\/$/, "");
}

// Trims an error for social_content.failure_reason so the card can show why
// an automatic image failed.
export function imageFailureReason(message: string): string {
  return `Automatic image failed: ${message}`.slice(0, 500);
}

// One automatic image for one opted-in post: generate, then schedule an
// Instagram draft; on failure count the attempt and save the reason. Re-checks
// the post first so a stale or duplicate call does nothing.
export async function runAutoImage(
  service: ReturnType<typeof createServiceClient>,
  id: string
): Promise<{ ok: boolean; skipped?: string; error?: string }> {
  const { data: post, error } = await service
    .from("social_content")
    .select("id, brand_id, hook, caption, platform, status, auto_image, auto_image_attempts, image_path, video_asset_id")
    .eq("id", id)
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!post) return { ok: false, skipped: "not found" };
  if (!post.auto_image || post.image_path || post.video_asset_id || post.auto_image_attempts >= MAX_AUTO_IMAGE_ATTEMPTS) {
    return { ok: true, skipped: "nothing to do" };
  }

  try {
    await generateAndSavePostImage(service, post);
    const next = statusAfterAutoImage(post.status);
    await service
      .from("social_content")
      .update({ status: next, failure_reason: null, updated_at: new Date().toISOString() })
      .eq("id", post.id)
      .eq("status", post.status); // don't override a change made meanwhile
    return { ok: true };
  } catch (err) {
    const message = (err as Error).message;
    console.error(`[social-images] ${post.id}:`, message);
    const { error: countError } = await service
      .from("social_content")
      .update({
        ...afterFailedAutoImage(post.auto_image_attempts),
        failure_reason: imageFailureReason(message),
        updated_at: new Date().toISOString(),
      })
      .eq("id", post.id);
    if (countError) console.error(`[social-images] ${post.id}: attempt not recorded:`, countError.message);
    return { ok: false, error: message };
  }
}
