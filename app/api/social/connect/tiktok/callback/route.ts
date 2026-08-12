import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";
import { exchangeCodeForTikTokToken, getTikTokUserInfo } from "@/lib/social/tiktok";

const SESSION_MAX_AGE_MS = 15 * 60 * 1000;

// No admin check — TikTok redirects the browser here directly after the
// user approves the authorize dialog on tiktok.com, so there's no
// Supabase session cookie context mid-flow. The `state` param (an oauth
// session id) was only ever handed out by the connect route, which IS
// admin-gated, so this callback is safe to trust. Same pattern as the
// Facebook callback.
export async function GET(req: NextRequest) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const code = req.nextUrl.searchParams.get("code");
  const sessionId = req.nextUrl.searchParams.get("state");
  const oauthError = req.nextUrl.searchParams.get("error");

  if (oauthError) {
    return NextResponse.redirect(`${appUrl}/admin/social?connectError=${encodeURIComponent(oauthError)}`);
  }
  if (!code || !sessionId) {
    return NextResponse.redirect(`${appUrl}/admin/social?connectError=missing_code`);
  }

  const service = createServiceClient();
  const { data: session } = await service
    .from("social_tiktok_oauth_sessions")
    .select("*")
    .eq("id", sessionId)
    .maybeSingle();

  if (!session || Date.now() - new Date(session.created_at).getTime() > SESSION_MAX_AGE_MS) {
    return NextResponse.redirect(`${appUrl}/admin/social?connectError=session_expired`);
  }

  try {
    const redirectUri = `${appUrl}/api/social/connect/tiktok/callback`;
    const token = await exchangeCodeForTikTokToken({ code, redirectUri, codeVerifier: session.code_verifier });
    const { username } = await getTikTokUserInfo(token.access_token);

    await Promise.all([
      service.from("social_brands").update({
        tiktok_open_id: token.open_id,
        tiktok_username: username,
        updated_at: new Date().toISOString(),
      }).eq("id", session.brand_id),
      service.from("social_tiktok_connections").upsert(
        {
          brand_id: session.brand_id,
          access_token: token.access_token,
          refresh_token: token.refresh_token,
          access_token_expires_at: new Date(Date.now() + token.expires_in * 1000).toISOString(),
          connected_at: new Date().toISOString(),
        },
        { onConflict: "brand_id" }
      ),
      service.from("social_tiktok_oauth_sessions").delete().eq("id", session.id),
    ]);

    return NextResponse.redirect(`${appUrl}/admin/social?connected=${encodeURIComponent(username ?? "TikTok account")}`);
  } catch (err) {
    console.error("[social/connect/tiktok/callback]", err);
    return NextResponse.redirect(`${appUrl}/admin/social?connectError=oauth_failed`);
  }
}
