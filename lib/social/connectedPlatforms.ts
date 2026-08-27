import type { SocialBrand, SocialPlatform } from "@/lib/database.types";

// Extracted from app/api/cron/social-generate's local helper — the content
// engine (lib/content/repurpose.ts) needs the same "which platforms can
// this brand actually post to" logic, so it lives here instead of being
// duplicated.
export function connectedPlatforms(brand: SocialBrand): SocialPlatform[] {
  const platforms: SocialPlatform[] = [];
  if (brand.fb_page_id) platforms.push("facebook");
  if (brand.socialapi_account_id) platforms.push("instagram");
  if (brand.socialapi_tiktok_account_id) platforms.push("tiktok");
  if (brand.socialapi_youtube_account_id) platforms.push("youtube");
  return platforms;
}
