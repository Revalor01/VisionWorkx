import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";
import { generateAndSavePostImage, statusAfterAutoImage } from "@/lib/social/postImage";

export const runtime = "nodejs";
export const maxDuration = 300;

// Every 10 minutes (vercel.json): generates images for posts that opted in
// (auto_image) and still have none, a few per run so each run stays well
// inside maxDuration. Only posts with a future publish time are picked — a
// post that's already due without an image is left alone (it stays a draft
// and never publishes). On failure the post is untouched and retried next run.
const PER_RUN = 3;

export async function GET(req: NextRequest) {
  if ((req.headers.get("authorization") ?? "") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const service = createServiceClient();
  const { data: posts, error } = await service
    .from("social_content")
    .select("id, brand_id, hook, caption, platform, status")
    .eq("auto_image", true)
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
      results.push({ id: post.id, ok: false, error: (err as Error).message });
    }
  }

  return NextResponse.json({ processed: results.length, results });
}
