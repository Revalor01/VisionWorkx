import { NextRequest, NextResponse } from "next/server";
import { createServerClient, createServiceClient } from "@/lib/supabase";
import { isAdmin } from "@/lib/social/authGuard";

const SESSION_MAX_AGE_MS = 15 * 60 * 1000;

export async function POST(req: NextRequest) {
  const supabase = createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!isAdmin(user)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: { sessionId?: string; pageId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body.sessionId || !body.pageId) {
    return NextResponse.json({ error: "Missing sessionId or pageId" }, { status: 400 });
  }

  const service = createServiceClient();
  const { data: session } = await service
    .from("social_oauth_sessions")
    .select("*")
    .eq("id", body.sessionId)
    .maybeSingle();

  if (!session || Date.now() - new Date(session.created_at).getTime() > SESSION_MAX_AGE_MS) {
    return NextResponse.json({ error: "Session expired or not found" }, { status: 404 });
  }

  const page = session.pages_json.find((p) => p.pageId === body.pageId);
  if (!page) return NextResponse.json({ error: "Page not found in session" }, { status: 404 });

  await Promise.all([
    service.from("social_brands").update({
      fb_page_id: page.pageId,
      ig_business_id: page.igBusinessId,
      updated_at: new Date().toISOString(),
    }).eq("id", session.brand_id),
    service.from("social_connections").upsert(
      { brand_id: session.brand_id, fb_page_access_token: page.pageAccessToken, connected_at: new Date().toISOString() },
      { onConflict: "brand_id" }
    ),
    service.from("social_oauth_sessions").delete().eq("id", session.id),
  ]);

  return NextResponse.json({ ok: true, pageName: page.pageName });
}
