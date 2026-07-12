import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { isAdmin } from "@/lib/social/authGuard";

// Instagram permissions deliberately excluded here — both the older
// ("instagram_basic") and newer ("instagram_business_basic") scope
// names are rejected by this classic Facebook OAuth dialog for this
// app. That's a real signal Meta has this app on the newer, separate
// Instagram Business Login system, which needs its own dedicated
// authorization flow rather than scopes bundled into this one. Get
// the Facebook Page connection working first; Instagram is a
// follow-up with its own OAuth implementation.
const SCOPES = [
  "pages_show_list",
  "pages_read_engagement",
  "pages_manage_posts",
  "pages_manage_metadata",
  "pages_messaging",
].join(",");

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
  authUrl.searchParams.set("scope", SCOPES);
  authUrl.searchParams.set("response_type", "code");

  return NextResponse.redirect(authUrl.toString());
}
