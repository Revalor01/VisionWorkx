import { NextRequest, NextResponse } from "next/server";
import { createServerClient, createServiceClient } from "@/lib/supabase";
import { startConnectOnboarding, refreshConnectStatus } from "@/lib/apps/payments";

export const runtime = "nodejs";

async function ownApp(appId: string, userId: string) {
  const service = createServiceClient();
  const { data: app } = await service
    .from("apps")
    .select("id, user_id, deploy_url, stripe_connect_account_id, payments_status")
    .eq("id", appId)
    .single();
  if (!app || app.user_id !== userId) return null;
  return app;
}

// GET — current payments status; opportunistically reconciles a "pending"
// account with Stripe (in case the account.updated webhook hasn't landed).
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

  let status = app.payments_status;
  if (status === "pending" && app.stripe_connect_account_id) {
    try {
      status = await refreshConnectStatus(app.stripe_connect_account_id);
    } catch (err) {
      console.error("[payments/connect] refresh failed:", err);
    }
  }
  return NextResponse.json({ status });
}

// POST — start (or resume) Stripe Connect onboarding; returns a hosted
// account link to redirect the owner to.
export async function POST(
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
  if (!app.deploy_url) {
    return NextResponse.json({ error: "This app isn't live yet." }, { status: 409 });
  }
  if (app.payments_status === "active") {
    return NextResponse.json({ error: "Payments are already set up." }, { status: 409 });
  }

  try {
    const url = await startConnectOnboarding(appId, user.email ?? null);
    return NextResponse.json({ url });
  } catch (err) {
    console.error("[payments/connect] onboarding failed:", err);
    return NextResponse.json(
      { error: "Couldn't start Stripe setup. Try again in a minute." },
      { status: 502 },
    );
  }
}
