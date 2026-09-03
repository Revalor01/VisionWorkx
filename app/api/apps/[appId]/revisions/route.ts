import { NextRequest, NextResponse } from "next/server";
import { createServerClient, createServiceClient } from "@/lib/supabase";
import {
  CHANGE_REQUEST_LIMITS,
  monthStartISO,
} from "@/lib/apps/changeRequestLimits";
import type { Plan } from "@/lib/database.types";

export const runtime = "nodejs";

const MAX_REQUEST_TEXT = 2000;

function appOrigin(): string {
  return process.env.NEXT_PUBLIC_APP_URL || "https://vision-workx.vercel.app";
}

async function ownApp(appId: string, userId: string) {
  const service = createServiceClient();
  const { data: app } = await service
    .from("apps")
    .select("id, user_id, name, status, deploy_url")
    .eq("id", appId)
    .single();
  if (!app || app.user_id !== userId) return null;
  return app;
}

async function changeRequestsThisMonth(userId: string): Promise<number> {
  const service = createServiceClient();
  const { count } = await service
    .from("app_revisions")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("kind", "change")
    .gte("created_at", monthStartISO());
  return count ?? 0;
}

// GET — this app's revision history + the caller's monthly change quota.
export async function GET(
  _req: NextRequest,
  props: { params: Promise<{ appId: string }> },
) {
  const { appId } = await props.params;
  const supabase = await createServerClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const app = await ownApp(appId, user.id);
  if (!app) return NextResponse.json({ error: "App not found" }, { status: 404 });

  const service = createServiceClient();
  const [{ data: revisions }, { data: profile }, used] = await Promise.all([
    service
      .from("app_revisions")
      .select("id, kind, status, request_text, changelog, changed_files, error, created_at, deployed_at")
      .eq("app_id", appId)
      .order("created_at", { ascending: false })
      .limit(30),
    service.from("profiles").select("plan").eq("id", user.id).single(),
    changeRequestsThisMonth(user.id),
  ]);

  const plan = (profile?.plan ?? "free") as Plan;
  return NextResponse.json({
    revisions: revisions ?? [],
    quota: { used, limit: CHANGE_REQUEST_LIMITS[plan] },
  });
}

// POST — queue a plain-English change request for this app.
export async function POST(
  req: NextRequest,
  props: { params: Promise<{ appId: string }> },
) {
  const { appId } = await props.params;
  const supabase = await createServerClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { requestText?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const requestText = (body.requestText ?? "").trim();
  if (!requestText) {
    return NextResponse.json({ error: "Describe the change you want." }, { status: 400 });
  }
  if (requestText.length > MAX_REQUEST_TEXT) {
    return NextResponse.json(
      { error: `Keep it under ${MAX_REQUEST_TEXT} characters.` },
      { status: 400 },
    );
  }

  const app = await ownApp(appId, user.id);
  if (!app) return NextResponse.json({ error: "App not found" }, { status: 404 });
  if (!app.deploy_url) {
    return NextResponse.json({ error: "This app isn't live yet." }, { status: 409 });
  }

  const service = createServiceClient();

  const { data: openRow } = await service
    .from("app_revisions")
    .select("id")
    .eq("app_id", appId)
    .in("status", ["queued", "building"])
    .limit(1)
    .maybeSingle();
  if (openRow) {
    return NextResponse.json(
      { error: "A change is already in progress for this app. One at a time." },
      { status: 409 },
    );
  }

  const { data: profile } = await service
    .from("profiles")
    .select("plan")
    .eq("id", user.id)
    .single();
  const plan = (profile?.plan ?? "free") as Plan;
  const limit = CHANGE_REQUEST_LIMITS[plan];
  const used = await changeRequestsThisMonth(user.id);
  if (used >= limit) {
    return NextResponse.json(
      {
        error: `You've used all ${limit} change requests on the ${plan} plan this month. Upgrade for more.`,
        quota: { used, limit },
      },
      { status: 429 },
    );
  }

  const { data: revision, error } = await service
    .from("app_revisions")
    .insert({
      app_id: appId,
      user_id: user.id,
      kind: "change",
      status: "queued",
      request_text: requestText,
    })
    .select("id, kind, status, request_text, changelog, changed_files, error, created_at, deployed_at")
    .single();
  if (error || !revision) {
    return NextResponse.json({ error: error?.message ?? "Could not queue" }, { status: 500 });
  }

  // Fire the processor (long-running: edit + deploy). Fire-and-forget, same
  // shape as /api/generate → /api/deploy.
  void fetch(`${appOrigin()}/api/apps/${appId}/revisions/process`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY ?? ""}`,
    },
    body: JSON.stringify({ revisionId: revision.id }),
  }).catch((err) => console.error("[revisions] processor trigger failed:", err));

  return NextResponse.json(
    { revision, quota: { used: used + 1, limit } },
    { status: 201 },
  );
}
