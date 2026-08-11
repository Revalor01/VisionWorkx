import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";
import { publishFacebookPost, publishFacebookPhotoPost, publishInstagramPost } from "@/lib/social/meta";

export const runtime = "nodejs";
export const maxDuration = 120;

const VIDEO_BUCKET = "social-video-assets";
const IMAGE_BUCKET = "social-content-images";
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

      let captionWithTags = post.hashtags.length > 0
        ? `${post.caption}\n\n${post.hashtags.map((h) => `#${h}`).join(" ")}`
        : post.caption;

      // Facebook unfurls the link into an image/title preview card using
      // the target page's Open Graph tags — Instagram captions aren't
      // clickable, so the link is only useful on Facebook.
      if (post.platform === "facebook" && brand.website_url) {
        captionWithTags = `${captionWithTags}\n\n${brand.website_url}`;
      }

      let platformPostId: string;

      if (post.platform === "facebook") {
        if (!brand.fb_page_id) throw new Error("Brand has no connected fb_page_id");

        if (post.image_path) {
          const { data: signed, error: signError } = await service.storage
            .from(IMAGE_BUCKET)
            .createSignedUrl(post.image_path, SIGNED_URL_TTL_SECONDS);
          if (signError || !signed) throw new Error("Failed to sign image URL for Facebook publish");
          const result = await publishFacebookPhotoPost({
            pageId: brand.fb_page_id,
            pageAccessToken: connection.fb_page_access_token,
            imageUrl: signed.signedUrl,
            caption: captionWithTags,
          });
          platformPostId = result.postId;
        } else {
          const result = await publishFacebookPost({
            pageId: brand.fb_page_id,
            pageAccessToken: connection.fb_page_access_token,
            message: captionWithTags,
          });
          platformPostId = result.postId;
        }
      } else {
        if (!brand.ig_business_id) throw new Error("Brand has no connected ig_business_id");

        let mediaUrl: string;
        let isVideo: boolean;
        if (post.video_asset_id) {
          const { data: asset } = await service
            .from("social_video_assets")
            .select("final_path")
            .eq("id", post.video_asset_id)
            .maybeSingle();
          if (!asset?.final_path) throw new Error("Linked video asset has no final_path");
          const { data: signed, error: signError } = await service.storage
            .from(VIDEO_BUCKET)
            .createSignedUrl(asset.final_path, SIGNED_URL_TTL_SECONDS);
          if (signError || !signed) throw new Error("Failed to sign media URL for Instagram publish");
          mediaUrl = signed.signedUrl;
          isVideo = true;
        } else if (post.image_path) {
          const { data: signed, error: signError } = await service.storage
            .from(IMAGE_BUCKET)
            .createSignedUrl(post.image_path, SIGNED_URL_TTL_SECONDS);
          if (signError || !signed) throw new Error("Failed to sign image URL for Instagram publish");
          mediaUrl = signed.signedUrl;
          isVideo = false;
        } else {
          throw new Error("Instagram posts require a linked video asset or a generated image");
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
