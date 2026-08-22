import { NextRequest, NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/social/adminAuth";
import {
  getInstagramConnectUrl,
  getTikTokConnectUrl,
  getYouTubeConnectUrl,
  getFacebookInboxConnectUrl,
} from "@/lib/social/socialApi";

export const runtime = "nodejs";
export const maxDuration = 30;

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://vision-workx.vercel.app";

type ConnectPlatform = "instagram" | "tiktok" | "youtube" | "facebook-inbox";

const CONNECT_URL_BY_PLATFORM: Record<ConnectPlatform, (redirectUri: string, state: string) => Promise<string>> = {
  instagram: getInstagramConnectUrl,
  tiktok: getTikTokConnectUrl,
  youtube: getYouTubeConnectUrl,
  "facebook-inbox": getFacebookInboxConnectUrl,
};

// Visit /api/admin/social/socialapi/connect?brand_id=<id>&platform=instagram|tiktok|youtube|facebook-inbox
// to start connecting that brand's account — redirects to the platform's
// authorize screen via SocialAPI's pre-approved app, no App Review/audit
// needed on Revalor's end. platform defaults to instagram for back-compat
// with existing links. "facebook-inbox" is separate from the existing
// direct-Meta Facebook posting connection — it's for DM/comment webhook
// coverage only.
export async function GET(req: NextRequest) {
  if (!(await isAdminRequest())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const brandId = req.nextUrl.searchParams.get("brand_id");
  if (!brandId) return NextResponse.json({ error: "brand_id is required" }, { status: 400 });

  const platformParam = req.nextUrl.searchParams.get("platform");
  const platform: ConnectPlatform =
    platformParam === "tiktok" || platformParam === "youtube" || platformParam === "facebook-inbox"
      ? platformParam
      : "instagram";

  try {
    const redirectUri = `${APP_URL}/api/admin/social/socialapi/callback`;
    // The platform rides along in `state` so the callback knows which
    // social_brands column to save the returned account_id to.
    const state = `${brandId}::${platform}`;
    const authUrl = await CONNECT_URL_BY_PLATFORM[platform](redirectUri, state);
    return NextResponse.redirect(authUrl);
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
