import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";
import { internalBaseUrl, MAX_AUTO_IMAGE_ATTEMPTS } from "@/lib/social/postImage";

export const runtime = "nodejs";
export const maxDuration = 300;

// Every 10 minutes (vercel.json): picks up to PER_RUN posts that opted in
// (auto_image), have no image yet and a future publish time, and asks
// /api/internal/social-image/<id> to make each one's image. The work runs as
// its own request there (see that route for why). A post that's already due
// without an image is left alone (it stays a draft and never publishes). A
// failure counts an attempt and saves the reason in failure_reason; after
// MAX_AUTO_IMAGE_ATTEMPTS the post drops out, so it can't keep spending or
// block the others.
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
    .select("id")
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

  const base = internalBaseUrl();
  // In parallel: each call is its own request (up to 120s), so three in a row
  // could outlast this run's maxDuration.
  const results = await Promise.all(
    (posts ?? []).map(async ({ id }) => {
      try {
        const res = await fetch(`${base}/api/internal/social-image/${id}`, {
          method: "POST",
          headers: { authorization: `Bearer ${secret}` },
          cache: "no-store",
        });
        return { id, status: res.status, body: (await res.json().catch(() => null)) as unknown };
      } catch (err) {
        // The call itself failed (network); the post is untouched and retried next run.
        console.error(`[social-images] ${id}: internal call failed:`, (err as Error).message);
        return { id, status: 0, body: { error: (err as Error).message } as unknown };
      }
    })
  );

  return NextResponse.json({ processed: results.length, results });
}
