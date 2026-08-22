import { NextRequest, NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/social/adminAuth";
import { getInstagramConnectUrl } from "@/lib/social/socialApi";

export const runtime = "nodejs";
export const maxDuration = 30;

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://vision-workx.vercel.app";

// Visit /api/admin/social/socialapi/connect?brand_id=<id> to start
// connecting that brand's Instagram account — redirects to Meta's
// authorize screen via SocialAPI.ai's pre-approved app, no App Review
// needed on Revalor's end.
export async function GET(req: NextRequest) {
  if (!(await isAdminRequest())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const brandId = req.nextUrl.searchParams.get("brand_id");
  if (!brandId) return NextResponse.json({ error: "brand_id is required" }, { status: 400 });

  try {
    const redirectUri = `${APP_URL}/api/admin/social/socialapi/callback`;
    const authUrl = await getInstagramConnectUrl(redirectUri, brandId);
    return NextResponse.redirect(authUrl);
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
