import { NextRequest, NextResponse } from "next/server";
import { createServerClient, createServiceClient } from "@/lib/supabase";
import { isAdmin } from "@/lib/social/authGuard";
import { generatePkcePair, buildAuthorizeUrl } from "@/lib/social/tiktok";

export async function GET(req: NextRequest) {
  const supabase = createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!isAdmin(user)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const brandId = req.nextUrl.searchParams.get("brandId");
  if (!brandId) return NextResponse.json({ error: "Missing brandId" }, { status: 400 });

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const redirectUri = `${appUrl}/api/social/connect/tiktok/callback`;
  const { verifier, challenge } = generatePkcePair();

  const service = createServiceClient();
  const { data: session, error } = await service
    .from("social_tiktok_oauth_sessions")
    .insert({ brand_id: brandId, code_verifier: verifier })
    .select("id")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const authUrl = buildAuthorizeUrl({ redirectUri, state: session.id, codeChallenge: challenge });
  return NextResponse.redirect(authUrl);
}
