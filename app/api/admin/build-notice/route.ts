import { NextRequest, NextResponse } from "next/server";
import { createServerClient, createServiceClient } from "@/lib/supabase";

const ADMIN_EMAIL = "sawilliams721@gmail.com";

// Post (or clear) the customer-facing build notice shown on /generate and the
// dashboard while a build is stuck/failed. Operator-only.
export async function POST(req: NextRequest) {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || user.email !== ADMIN_EMAIL) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { appId?: string; notice?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const appId = body.appId ?? "";
  if (!appId) return NextResponse.json({ error: "Missing appId" }, { status: 400 });

  const notice = (body.notice ?? "").trim();
  const service = createServiceClient();
  const { error } = await service
    .from("apps")
    .update({
      build_notice: notice || null,
      build_notice_at: notice ? new Date().toISOString() : null,
    })
    .eq("id", appId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, notice: notice || null });
}
