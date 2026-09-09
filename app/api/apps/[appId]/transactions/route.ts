import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";
import { listConnectedCharges } from "@/lib/apps/payments";

export const runtime = "nodejs";

// Called server-to-server by the generated app (never the browser), with
// its own APP_CHECKOUT_SECRET. Returns recent charges on the app's
// connected Stripe account for the in-app "Payments history" view.
async function authedApp(appId: string, req: NextRequest) {
  const secret = req.headers.get("x-vw-checkout-secret") ?? "";
  if (!secret) return null;
  const service = createServiceClient();
  const { data: app } = await service
    .from("apps")
    .select("id, checkout_secret, stripe_connect_account_id, payments_test_mode")
    .eq("id", appId)
    .single();
  if (!app || !app.checkout_secret || app.checkout_secret !== secret) return null;
  return app;
}

// GET ?limit=25&starting_after=<chargeId>
export async function GET(
  req: NextRequest,
  props: { params: Promise<{ appId: string }> },
) {
  const { appId } = await props.params;
  const app = await authedApp(appId, req);
  if (!app) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const limitRaw = Number(req.nextUrl.searchParams.get("limit") ?? "25");
  const startingAfter = req.nextUrl.searchParams.get("starting_after") ?? undefined;

  try {
    const result = await listConnectedCharges(app, {
      limit: Number.isFinite(limitRaw) ? limitRaw : 25,
      startingAfter,
    });
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }
}
