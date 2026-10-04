import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";
import { afterFailedAutoImage, generateAndSavePostImage, MAX_AUTO_IMAGE_ATTEMPTS, statusAfterAutoImage } from "@/lib/social/postImage";

export const runtime = "nodejs";
export const maxDuration = 300;

// Every 10 minutes (vercel.json): generates images for posts that opted in
// (auto_image) and still have none, a few per run so each run stays well
// inside maxDuration. Only posts with a future publish time are picked — a
// post that's already due without an image is left alone (it stays a draft
// and never publishes). A failure counts an attempt; after
// MAX_AUTO_IMAGE_ATTEMPTS the job turns auto_image off and moves on, so a post
// that always fails can't keep spending or block the others.
const PER_RUN = 3;

export async function GET(req: NextRequest) {
  // This job spends money, so a missing CRON_SECRET must never let
  // "Bearer undefined" through.
  const secret = process.env.CRON_SECRET;
  if (!secret || (req.headers.get("authorization") ?? "") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const service = createServiceClient();
  const { data: posts, error } = await service
    .from("social_content")
    .select("id, brand_id, hook, caption, platform, status, auto_image_attempts")
    .eq("auto_image", true)
    .lt("auto_image_attempts", MAX_AUTO_IMAGE_ATTEMPTS)
    .is("image_path", null)
    .is("video_asset_id", null)
    .in("status", ["draft", "approved", "scheduled"])
    .in("platform", ["facebook", "instagram"])
    .gt("scheduled_at", new Date().toISOString())
    .order("scheduled_at", { ascending: true })
    .limit(PER_RUN);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const results: { id: string; ok: boolean; error?: string }[] = [];
  for (const post of posts ?? []) {
    try {
      await generateAndSavePostImage(service, post);
      const next = statusAfterAutoImage(post.status);
      if (next !== post.status) {
        await service
          .from("social_content")
          .update({ status: next, updated_at: new Date().toISOString() })
          .eq("id", post.id)
          .eq("status", post.status); // don't override a change made meanwhile
      }
      results.push({ id: post.id, ok: true });
    } catch (err) {
      console.error(`[social-images] ${post.id}:`, (err as Error).message);
      await service
        .from("social_content")
        .update({ ...afterFailedAutoImage(post.auto_image_attempts), updated_at: new Date().toISOString() })
        .eq("id", post.id);
      results.push({ id: post.id, ok: false, error: (err as Error).message });
    }
  }

  return NextResponse.json({ processed: results.length, results });
}
