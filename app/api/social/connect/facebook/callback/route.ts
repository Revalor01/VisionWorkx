import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";
import { exchangeCodeForUserToken, exchangeForLongLivedUserToken, getManagedPages } from "@/lib/social/meta";

// No admin check here — Meta redirects the browser here directly after
// the user approves the OAuth dialog on facebook.com, so there's no
// Supabase session cookie context from our own app mid-flow. The `state`
// param (brandId) was only ever handed out by the connect route, which
// IS admin-gated, so this callback is safe to trust.
export async function GET(req: NextRequest) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const code = req.nextUrl.searchParams.get("code");
  const brandId = req.nextUrl.searchParams.get("state");

  if (!code || !brandId) {
    return NextResponse.redirect(`${appUrl}/admin/social?connectError=missing_code`);
  }

  try {
    const redirectUri = `${appUrl}/api/social/connect/facebook/callback`;
    const shortLivedToken = await exchangeCodeForUserToken(code, redirectUri);
    const longLivedToken = await exchangeForLongLivedUserToken(shortLivedToken);
    const pages = await getManagedPages(longLivedToken);

    if (pages.length === 0) {
      return NextResponse.redirect(`${appUrl}/admin/social?connectError=no_pages`);
    }

    const service = createServiceClient();

    // Exactly one managed page — link it immediately, no picker needed.
    if (pages.length === 1) {
      const page = pages[0];
      await Promise.all([
        service.from("social_brands").update({
          fb_page_id: page.pageId,
          ig_business_id: page.igBusinessId,
          updated_at: new Date().toISOString(),
        }).eq("id", brandId),
        service.from("social_connections").upsert(
          { brand_id: brandId, fb_page_access_token: page.pageAccessToken, connected_at: new Date().toISOString() },
          { onConflict: "brand_id" }
        ),
      ]);
      return NextResponse.redirect(`${appUrl}/admin/social?connected=${page.pageName}`);
    }

    // Multiple pages — hold the token+list server-side, let the admin pick in the UI.
    const { data: session, error } = await service
      .from("social_oauth_sessions")
      .insert({ brand_id: brandId, user_token: longLivedToken, pages_json: pages })
      .select("id")
      .single();

    if (error) return NextResponse.redirect(`${appUrl}/admin/social?connectError=session_save_failed`);

    return NextResponse.redirect(`${appUrl}/admin/social?connectSession=${session.id}`);
  } catch (err) {
    console.error("[social/connect/facebook/callback]", err);
    return NextResponse.redirect(`${appUrl}/admin/social?connectError=oauth_failed`);
  }
}
