import { NextRequest, NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/social/adminAuth";
import { createServiceClient } from "@/lib/supabase";

export const runtime = "nodejs";
export const maxDuration = 30;

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://vision-workx.vercel.app";

// Receives the redirect back from SocialAPI.ai after a brand's account is
// authorized (or denied) — see getInstagramConnectUrl/getTikTokConnectUrl/
// getYouTubeConnectUrl's redirectUri. `state` is "<brand_id>::<platform>"
// (set at connect time);
// a bare brand_id with no "::" is treated as instagram for back-compat with
// any in-flight session started before platform was encoded into state.
export async function GET(req: NextRequest) {
  if (!(await isAdminRequest())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const params = req.nextUrl.searchParams;
  const status = params.get("status");
  const state = params.get("state");
  const dashboardUrl = new URL("/admin/social", APP_URL);

  if (status !== "success" || !state) {
    dashboardUrl.searchParams.set("socialapi_error", params.get("error_description") ?? "Connection failed");
    return NextResponse.redirect(dashboardUrl);
  }

  const [brandId, platform = "instagram"] = state.split("::");

  const accountId = params.get("account_id");
  if (!accountId) {
    dashboardUrl.searchParams.set("socialapi_error", "No account_id returned");
    return NextResponse.redirect(dashboardUrl);
  }

  const service = createServiceClient();
  const { error } =
    platform === "tiktok"
      ? await service.from("social_brands").update({ socialapi_tiktok_account_id: accountId }).eq("id", brandId)
      : platform === "youtube"
        ? await service.from("social_brands").update({ socialapi_youtube_account_id: accountId }).eq("id", brandId)
        : platform === "facebook-inbox"
          ? await service.from("social_brands").update({ socialapi_facebook_account_id: accountId }).eq("id", brandId)
          : await service.from("social_brands").update({ socialapi_account_id: accountId }).eq("id", brandId);

  if (error) {
    dashboardUrl.searchParams.set("socialapi_error", error.message);
    return NextResponse.redirect(dashboardUrl);
  }

  dashboardUrl.searchParams.set("socialapi_connected", "1");
  return NextResponse.redirect(dashboardUrl);
}
