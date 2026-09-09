import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { createServerClient } from "@/lib/supabase";
import { confirmGuidedSession } from "@/lib/apps/guidedSession";

export const runtime = "nodejs";

// POST { sessionId } — called by /guided/success on return from Stripe.
// Verifies the Checkout session was paid by this user, then hands off to
// confirmGuidedSession (shared with the Stripe webhook, idempotent).
export async function POST(req: NextRequest) {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) {
    return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  }

  let body: { sessionId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const sessionId = (body.sessionId ?? "").trim();
  if (!sessionId) {
    return NextResponse.json({ error: "Missing session." }, { status: 400 });
  }

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
  const checkout = await stripe.checkout.sessions.retrieve(sessionId);

  if (checkout.metadata?.userId !== user.id) {
    return NextResponse.json({ error: "That session isn't yours." }, { status: 403 });
  }
  if (checkout.payment_status !== "paid") {
    return NextResponse.json({ paid: false, error: "Payment not completed." }, { status: 402 });
  }

  const result = await confirmGuidedSession({ stripe, sessionId });
  if (result === "not_found") {
    return NextResponse.json({ error: "Request not found." }, { status: 404 });
  }
  return NextResponse.json({ ok: true, alreadyConfirmed: result === "already" });
}
