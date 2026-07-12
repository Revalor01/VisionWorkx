import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { isAdmin } from "@/lib/social/authGuard";

// This app is tied to a Business Portfolio, and a personal user token
// (the classic scope=... flow) couldn't enumerate the Business-owned
// Page via /me/accounts despite the account having full Page access —
// Meta's own docs say that's expected: Business-owned assets need a
// Facebook Login for Business flow with a System User token, not a
// personal user token. This uses a Login Configuration (config_id)
// created in the Meta App dashboard instead of a raw scope list.
const CONFIG_ID = process.env.META_LOGIN_CONFIG_ID!;

export async function GET(req: NextRequest) {
  const supabase = createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!isAdmin(user)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const brandId = req.nextUrl.searchParams.get("brandId");
  if (!brandId) return NextResponse.json({ error: "Missing brandId" }, { status: 400 });

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const redirectUri = `${appUrl}/api/social/connect/facebook/callback`;

  const authUrl = new URL("https://www.facebook.com/v21.0/dialog/oauth");
  authUrl.searchParams.set("client_id", process.env.META_APP_ID!);
  authUrl.searchParams.set("redirect_uri", redirectUri);
  authUrl.searchParams.set("state", brandId);
  authUrl.searchParams.set("config_id", CONFIG_ID);
  authUrl.searchParams.set("response_type", "code");

  return NextResponse.redirect(authUrl.toString());
}
