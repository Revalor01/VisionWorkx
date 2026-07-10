import { NextRequest, NextResponse } from "next/server";
import { createServerClient, createServiceClient } from "@/lib/supabase";
import { isAdmin } from "@/lib/social/authGuard";

const SESSION_MAX_AGE_MS = 15 * 60 * 1000;

// Returns only the page list (id/name), never the stored user_token —
// that stays server-side and is only read by the finalize route.
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!isAdmin(user)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const service = createServiceClient();
  const { data: session } = await service
    .from("social_oauth_sessions")
    .select("id, brand_id, pages_json, created_at")
    .eq("id", params.id)
    .maybeSingle();

  if (!session || Date.now() - new Date(session.created_at).getTime() > SESSION_MAX_AGE_MS) {
    return NextResponse.json({ error: "Session expired or not found" }, { status: 404 });
  }

  const pages = session.pages_json.map((p) => ({ pageId: p.pageId, pageName: p.pageName }));
  return NextResponse.json({ brandId: session.brand_id, pages });
}
