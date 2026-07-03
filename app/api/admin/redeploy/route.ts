import { NextRequest, NextResponse } from "next/server";
import { createServerClient, createServiceClient } from "@/lib/supabase";

const ADMIN_EMAIL = "sawilliams721@gmail.com";

export async function POST(req: NextRequest) {
  const supabase = createServerClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user || user.email !== ADMIN_EMAIL) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { appId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const appId = body.appId ?? "";
  if (!appId) {
    return NextResponse.json({ error: "Missing appId" }, { status: 400 });
  }

  const service = createServiceClient();

  const { data: app } = await service
    .from("apps")
    .select("id, status, generated_code")
    .eq("id", appId)
    .single();

  if (!app) {
    return NextResponse.json({ error: "App not found" }, { status: 404 });
  }

  if (!app.generated_code) {
    return NextResponse.json({ error: "No generated code — regenerate this app first" }, { status: 400 });
  }

  // Reset status to ready so deploy route accepts it
  await service.from("apps").update({ status: "ready" }).eq("id", appId);

  // Fire deploy pipeline
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://vision-workx.vercel.app";
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  fetch(`${appUrl}/api/deploy`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${serviceKey}`,
    },
    body: JSON.stringify({ appId, _internal: true }),
  }).catch((err) => console.error("[api/admin/redeploy] deploy failed:", err));

  return NextResponse.json({ ok: true, message: "Deploy queued" });
}
