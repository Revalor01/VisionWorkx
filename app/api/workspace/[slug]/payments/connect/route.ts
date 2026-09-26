import { NextRequest, NextResponse } from "next/server";
import { requireOwner } from "@/lib/modules/ownerApi";
import { modulesServiceClient } from "@/lib/modules/supabase";
import { startConnectOnboarding, refreshConnectStatus } from "@/lib/modules/connect";

export const runtime = "nodejs";

// GET — current Connect status; opportunistically reconciles a "pending"
// account with Stripe (in case the account.updated webhook hasn't landed
// yet), same pattern as app/api/apps/[appId]/payments/connect.
export async function GET(_req: NextRequest, props: { params: Promise<{ slug: string }> }) {
  const { slug } = await props.params;
  const auth = await requireOwner(slug);
  if ("error" in auth) return auth.error;

  const db = modulesServiceClient();
  const { data: ws } = await db
    .from("vw_workspaces")
    .select("stripe_connect_account_id, connect_payments_status, connect_payments_test_mode")
    .eq("id", auth.workspace.id)
    .single();
  if (!ws) return NextResponse.json({ error: "Not found" }, { status: 404 });

  let status = ws.connect_payments_status;
  if (status === "pending" && ws.stripe_connect_account_id) {
    try {
      status = await refreshConnectStatus(ws.stripe_connect_account_id, !!ws.connect_payments_test_mode);
    } catch (err) {
      console.error("[workspace payments/connect] refresh failed:", err);
    }
  }
  return NextResponse.json({ status });
}

// POST — start (or resume) Stripe Connect onboarding for this workspace;
// returns a hosted account link to redirect the owner to.
export async function POST(_req: NextRequest, props: { params: Promise<{ slug: string }> }) {
  const { slug } = await props.params;
  const auth = await requireOwner(slug);
  if ("error" in auth) return auth.error;

  const db = modulesServiceClient();
  const { data: ws } = await db.from("vw_workspaces").select("connect_payments_status").eq("id", auth.workspace.id).single();
  if (!ws) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (ws.connect_payments_status === "active") {
    return NextResponse.json({ error: "Payments are already set up." }, { status: 409 });
  }

  try {
    const url = await startConnectOnboarding(auth.workspace.id, slug, auth.user.email ?? null);
    return NextResponse.json({ url });
  } catch (err) {
    console.error("[workspace payments/connect] onboarding failed:", err);
    return NextResponse.json({ error: "Couldn't start Stripe setup. Try again in a minute." }, { status: 502 });
  }
}
