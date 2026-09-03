import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";
import {
  createConnectedCheckout,
  checkoutSessionPaid,
  type CheckoutRequest,
} from "@/lib/apps/payments";

export const runtime = "nodejs";

// Called server-to-server by the generated app (never the browser). The app
// authenticates with its own APP_CHECKOUT_SECRET, injected at deploy time.
async function authedApp(appId: string, req: NextRequest) {
  const secret = req.headers.get("x-vw-checkout-secret") ?? "";
  if (!secret) return null;
  const service = createServiceClient();
  const { data: app } = await service
    .from("apps")
    .select("id, checkout_secret, stripe_connect_account_id, payments_status")
    .eq("id", appId)
    .single();
  if (!app || !app.checkout_secret || app.checkout_secret !== secret) return null;
  return app;
}

// POST — create a Checkout Session on the app's connected account.
// Body: { mode, successUrl, cancelUrl, amount?, currency?, productName?, priceId?, metadata? }
export async function POST(
  req: NextRequest,
  props: { params: Promise<{ appId: string }> },
) {
  const { appId } = await props.params;
  const app = await authedApp(appId, req);
  if (!app) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: CheckoutRequest;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (body.mode !== "payment" && body.mode !== "subscription") {
    return NextResponse.json({ error: "mode must be payment or subscription" }, { status: 400 });
  }
  if (!body.successUrl || !body.cancelUrl) {
    return NextResponse.json({ error: "successUrl and cancelUrl are required" }, { status: 400 });
  }

  try {
    const url = await createConnectedCheckout(app, body);
    return NextResponse.json({ url });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }
}

// GET ?session_id=... — the generated app confirms a payment on return.
export async function GET(
  req: NextRequest,
  props: { params: Promise<{ appId: string }> },
) {
  const { appId } = await props.params;
  const app = await authedApp(appId, req);
  if (!app) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!app.stripe_connect_account_id) {
    return NextResponse.json({ error: "not connected" }, { status: 409 });
  }

  const sessionId = req.nextUrl.searchParams.get("session_id") ?? "";
  if (!sessionId) {
    return NextResponse.json({ error: "session_id is required" }, { status: 400 });
  }

  try {
    const result = await checkoutSessionPaid(app.stripe_connect_account_id, sessionId);
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }
}
