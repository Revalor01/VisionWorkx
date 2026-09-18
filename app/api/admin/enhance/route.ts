import { NextRequest, NextResponse } from "next/server";
import { createServerClient, createServiceClient } from "@/lib/supabase";

const ADMIN_EMAIL = "sawilliams721@gmail.com";
const MAX_REQUEST_TEXT = 4000;

function appOrigin(): string {
  return process.env.NEXT_PUBLIC_APP_URL || "https://vision-workx.vercel.app";
}

// Admin-only "master access" to request a plain-English change on ANY real
// app, bypassing the per-customer ownership check and monthly quota in
// app/api/apps/[appId]/revisions/route.ts (those exist to gate a paying
// customer's own usage, not the operator testing/enhancing a site). Reuses
// the exact same edit+deploy pipeline as a real customer request — this
// inserts the same app_revisions row shape and fires the same internal
// processor endpoint, so there's no second, unproven code path.
export async function POST(req: NextRequest) {
  const supabase = await createServerClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user || user.email !== ADMIN_EMAIL) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { appId?: string; requestText?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const appId = body.appId ?? "";
  const requestText = (body.requestText ?? "").trim();
  if (!appId) return NextResponse.json({ error: "Missing appId" }, { status: 400 });
  if (!requestText) return NextResponse.json({ error: "Describe the change you want." }, { status: 400 });
  if (requestText.length > MAX_REQUEST_TEXT) {
    return NextResponse.json({ error: `Keep it under ${MAX_REQUEST_TEXT} characters.` }, { status: 400 });
  }

  const service = createServiceClient();

  const { data: app } = await service
    .from("apps")
    .select("id, name, user_id, generated_code, deploy_url")
    .eq("id", appId)
    .single();
  if (!app) return NextResponse.json({ error: "App not found" }, { status: 404 });
  if (!app.generated_code) return NextResponse.json({ error: "This app has no source to edit yet." }, { status: 409 });
  if (!app.deploy_url) return NextResponse.json({ error: "This app isn't live yet." }, { status: 409 });
  if (!app.user_id) {
    return NextResponse.json({ error: "Unclaimed preview — claim it first, then enhance it." }, { status: 409 });
  }

  const { data: openRow } = await service
    .from("app_revisions")
    .select("id")
    .eq("app_id", appId)
    .in("status", ["queued", "building"])
    .limit(1)
    .maybeSingle();
  if (openRow) {
    return NextResponse.json({ error: "A change is already in progress for this app. One at a time." }, { status: 409 });
  }

  const { data: revision, error } = await service
    .from("app_revisions")
    .insert({
      app_id: appId,
      user_id: app.user_id,
      kind: "change",
      status: "queued",
      request_text: requestText,
    })
    .select("id")
    .single();
  if (error || !revision) {
    return NextResponse.json({ error: error?.message ?? "Could not queue" }, { status: 500 });
  }

  // Same internal processor a real customer's change request fires — see
  // app/api/apps/[appId]/revisions/route.ts.
  void fetch(`${appOrigin()}/api/apps/${appId}/revisions/process`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY ?? ""}`,
    },
    body: JSON.stringify({ revisionId: revision.id }),
  }).catch((err) => console.error("[admin/enhance] processor trigger failed:", err));

  return NextResponse.json({ ok: true, revisionId: revision.id });
}
