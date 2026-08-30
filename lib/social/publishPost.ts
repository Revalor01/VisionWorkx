import { createServiceClient } from "@/lib/supabase";
import { publishFacebookPost, publishFacebookPhotoPost } from "@/lib/social/meta";
import { publishInstagramPost, publishTikTokPost, publishYouTubePost } from "@/lib/social/socialApi";
import { resolveTikTokAccountId } from "@/lib/social/connectedPlatforms";
import type { SocialContent } from "@/lib/database.types";

// Shared by the /10min cron (app/api/cron/social-publish) and the manual
// "Post now" button (app/api/social/content/[id]/publish-now) — one place
// for the actual platform-publish logic so the two callers can't drift.

const VIDEO_BUCKET = "social-video-assets";
const IMAGE_BUCKET = "social-content-images";
const SIGNED_URL_TTL_SECONDS = 3600; // long enough for Meta's servers to fetch the media during processing

export async function publishPost(
  service: ReturnType<typeof createServiceClient>,
  post: SocialContent
): Promise<{ ok: boolean; error?: string }> {
  try {
    const { data: brand } = await service.from("social_brands").select("*").eq("id", post.brand_id).maybeSingle();
    if (!brand) throw new Error("Brand not found");

    let captionWithTags = post.hashtags.length > 0
      ? `${post.caption}\n\n${post.hashtags.map((h) => `#${h}`).join(" ")}`
      : post.caption;

    // Facebook unfurls the link into an image/title preview card using
    // the target page's Open Graph tags — Instagram/TikTok captions
    // aren't clickable, so the link is only useful on Facebook.
    if (post.platform === "facebook" && brand.website_url) {
      captionWithTags = `${captionWithTags}\n\n${brand.website_url}`;
    }

    let platformPostId: string;

    if (post.platform === "tiktok") {
      const tiktokAccountId = await resolveTikTokAccountId(service, brand);
      if (!tiktokAccountId) throw new Error("Brand has no connected SocialAPI.ai TikTok account");
      if (!post.video_asset_id) throw new Error("TikTok posts require a linked video asset");

      const { data: asset } = await service
        .from("social_video_assets")
        .select("final_path")
        .eq("id", post.video_asset_id)
        .maybeSingle();
      if (!asset?.final_path) throw new Error("Linked video asset has no final_path");
      const { data: signed, error: signError } = await service.storage
        .from(VIDEO_BUCKET)
        .createSignedUrl(asset.final_path, SIGNED_URL_TTL_SECONDS);
      if (signError || !signed) throw new Error("Failed to sign media URL for TikTok publish");

      const result = await publishTikTokPost({
        accountId: tiktokAccountId,
        mediaUrl: signed.signedUrl,
        caption: captionWithTags,
      });
      platformPostId = result.postId;

      await service
        .from("social_content")
        .update({ status: "posted", posted_at: new Date().toISOString(), platform_post_id: platformPostId })
        .eq("id", post.id);
      return { ok: true };
    }

    if (post.platform === "youtube") {
      if (!brand.socialapi_youtube_account_id) throw new Error("Brand has no connected SocialAPI.ai YouTube account");
      if (!post.video_asset_id) throw new Error("YouTube posts require a linked video asset");

      const { data: asset } = await service
        .from("social_video_assets")
        .select("final_path")
        .eq("id", post.video_asset_id)
        .maybeSingle();
      if (!asset?.final_path) throw new Error("Linked video asset has no final_path");
      const { data: signed, error: signError } = await service.storage
        .from(VIDEO_BUCKET)
        .createSignedUrl(asset.final_path, SIGNED_URL_TTL_SECONDS);
      if (signError || !signed) throw new Error("Failed to sign media URL for YouTube publish");

      // YouTube is the one platform with a distinct title field — hook is
      // already written to fit a short scroll-stopping line (<=80 chars),
      // well under YouTube's 100-char title cap. Falls back to the start
      // of the caption if a post has no hook.
      const result = await publishYouTubePost({
        accountId: brand.socialapi_youtube_account_id,
        mediaUrl: signed.signedUrl,
        title: post.hook || post.caption.slice(0, 100),
        description: captionWithTags,
      });
      platformPostId = result.postId;

      await service
        .from("social_content")
        .update({ status: "posted", posted_at: new Date().toISOString(), platform_post_id: platformPostId })
        .eq("id", post.id);
      return { ok: true };
    }

    if (post.platform === "facebook") {
      const { data: connection } = await service
        .from("social_connections")
        .select("fb_page_access_token")
        .eq("brand_id", post.brand_id)
        .maybeSingle();
      if (!connection) throw new Error("Brand not connected to a Facebook Page");
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
      if (!brand.socialapi_account_id) throw new Error("Brand has no connected SocialAPI.ai Instagram account");

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
        accountId: brand.socialapi_account_id,
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

    return { ok: true };
  } catch (err) {
    console.error(`[publishPost] post ${post.id} failed:`, err);
    await service
      .from("social_content")
      .update({ status: "failed", failure_reason: (err as Error).message })
      .eq("id", post.id);
    return { ok: false, error: (err as Error).message };
  }
}
