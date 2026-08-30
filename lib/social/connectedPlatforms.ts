import type { SocialBrand, SocialPlatform } from "@/lib/database.types";
import type { createServiceClient } from "@/lib/supabase";

type Service = ReturnType<typeof createServiceClient>;

// The brand row this account actually lives on - other brands without their
// own TikTok connection post through this one instead of being unable to
// post to TikTok at all ("Revalor LLC" is a company-wide account handling
// video for multiple products). Matches the exact name used elsewhere
// (BrandsTab.tsx's BRAND_ORDER/BRAND_LOGOS) - if it's ever renamed again,
// update here too.
const SHARED_TIKTOK_BRAND_NAME = "Revalor LLC";

// Resolves which SocialAPI.ai TikTok account a brand's posts should actually
// publish to: its own if connected, otherwise the shared Revalor LLC account.
export async function resolveTikTokAccountId(service: Service, brand: SocialBrand): Promise<string | null> {
  if (brand.socialapi_tiktok_account_id) return brand.socialapi_tiktok_account_id;
  if (brand.name === SHARED_TIKTOK_BRAND_NAME) return null;

  const { data: shared } = await service
    .from("social_brands")
    .select("socialapi_tiktok_account_id")
    .eq("name", SHARED_TIKTOK_BRAND_NAME)
    .maybeSingle();
  return shared?.socialapi_tiktok_account_id ?? null;
}

// Extracted from app/api/cron/social-generate's local helper - the content
// engine (lib/content/repurpose.ts) needs the same "which platforms can
// this brand actually post to" logic, so it lives here instead of being
// duplicated.
export async function connectedPlatforms(service: Service, brand: SocialBrand): Promise<SocialPlatform[]> {
  const platforms: SocialPlatform[] = [];
  if (brand.fb_page_id) platforms.push("facebook");
  if (brand.socialapi_account_id) platforms.push("instagram");
  if (await resolveTikTokAccountId(service, brand)) platforms.push("tiktok");
  if (brand.socialapi_youtube_account_id) platforms.push("youtube");
  return platforms;
}
