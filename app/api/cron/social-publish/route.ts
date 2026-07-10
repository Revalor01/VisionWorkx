import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";
import { publishFacebookPost, publishInstagramPost } from "@/lib/social/meta";

export const runtime = "nodejs";
export const maxDuration = 120;

const BUCKET = "social-video-assets";
const SIGNED_URL_TTL_SECONDS = 3600; // long enough for Meta's servers to fetch the media during processing

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization") ?? "";
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const service = createServiceClient();

  const { data: due } = await service
    .from("social_content")
    .select("*")
    .eq("status", "scheduled")
    .lte("scheduled_at", new Date().toISOString());

  const results: { id: string; ok: boolean; error?: string }[] = [];

  for (const post of due ?? []) {
    try {
      const { data: brand } = await service.from("social_brands").select("*").eq("id", post.brand_id).maybeSingle();
      const { data: connection } = await service
        .from("social_connections")
        .select("fb_page_access_token")
        .eq("brand_id", post.brand_id)
        .maybeSingle();

      if (!brand || !connection) throw new Error("Brand not connected to a Facebook Page");

      const captionWithTags = post.hashtags.length > 0
        ? `${post.caption}\n\n${post.hashtags.map((h) => `#${h}`).join(" ")}`
        : post.caption;

      let platformPostId: string;

      if (post.platform === "facebook") {
        if (!brand.fb_page_id) throw new Error("Brand has no connected fb_page_id");
        const result = await publishFacebookPost({
          pageId: brand.fb_page_id,
          pageAccessToken: connection.fb_page_access_token,
          message: captionWithTags,
        });
        platformPostId = result.postId;
      } else {
        if (!brand.ig_business_id) throw new Error("Brand has no connected ig_business_id");

        let mediaUrl: string;
        let isVideo = false;
        if (post.video_asset_id) {
          const { data: asset } = await service
            .from("social_video_assets")
            .select("final_path")
            .eq("id", post.video_asset_id)
            .maybeSingle();
          if (!asset?.final_path) throw new Error("Linked video asset has no final_path");
          const { data: signed, error: signError } = await service.storage
            .from(BUCKET)
            .createSignedUrl(asset.final_path, SIGNED_URL_TTL_SECONDS);
          if (signError || !signed) throw new Error("Failed to sign media URL for Instagram publish");
          mediaUrl = signed.signedUrl;
          isVideo = true;
        } else {
          throw new Error("Instagram posts require a linked video asset in this version");
        }

        const result = await publishInstagramPost({
          igBusinessId: brand.ig_business_id,
          pageAccessToken: connection.fb_page_access_token,
          mediaUrl,
          isVideo,
          caption: captionWithTags,
        });
        platformPostId = result.postId;
      }

      await service
        .from("social_content")
        .update({ status: "posted", posted_at: new Date().toISOString(), platform_post_id: platformPostId })
        .eq("id", post.id);

      results.push({ id: post.id, ok: true });
    } catch (err) {
      console.error(`[cron/social-publish] post ${post.id} failed:`, err);
      await service
        .from("social_content")
        .update({ status: "failed", failure_reason: (err as Error).message })
        .eq("id", post.id);
      results.push({ id: post.id, ok: false, error: (err as Error).message });
    }
  }

  return NextResponse.json({ processed: results.length, results });
}
