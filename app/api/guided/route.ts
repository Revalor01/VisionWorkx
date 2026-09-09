import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { createServerClient, createServiceClient } from "@/lib/supabase";
import { confirmGuidedSession } from "@/lib/apps/guidedSession";

export const runtime = "nodejs";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://vision-workx.vercel.app";
const GUIDED_PRICE_ID = process.env.STRIPE_GUIDED_SESSION_PRICE_ID; // optional

// Tester bypass — a valid ?comp=<code> (from the /guided form) skips the
// $10 Checkout entirely: the request is filed, marked paid, and the
// emails go out, so the full guided flow can be tested without a charge.
const COMP_CODES = (process.env.GUIDED_COMP_CODES ?? "")
  .split(",")
  .map((c) => c.trim())
  .filter(Boolean);

// POST { fullName, businessName, businessType, description } — the caller
// must already be signed in (the /guided form creates the account first).
// Files an unpaid guided_session_requests row and returns a Stripe
// Checkout URL for the $10 session fee. Emails go out only once payment
// completes, from /api/guided/confirm.
export async function POST(req: NextRequest) {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) {
    return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  }

  let body: {
    fullName?: string;
    businessName?: string;
    businessType?: string;
    description?: string;
    compCode?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const compCode = (body.compCode ?? "").trim();
  if (compCode && !COMP_CODES.includes(compCode)) {
    return NextResponse.json({ error: "That comp code isn't valid." }, { status: 403 });
  }
  const comp = compCode.length > 0;

  const fullName = (body.fullName ?? "").trim().slice(0, 120) || null;
  const businessName = (body.businessName ?? "").trim().slice(0, 120) || null;
  const businessType = (body.businessType ?? "").trim().slice(0, 120) || null;
  const description = (body.description ?? "").trim().slice(0, 1500) || null;

  if (!businessType || !description || description.length < 10) {
    return NextResponse.json(
      { error: "Add your business type and a few sentences about what you need." },
      { status: 400 },
    );
  }

  const service = createServiceClient();

  // ── Comp path: no Stripe, no charge. File the row, then confirm it
  // (marks paid + scheduled + sends the emails) via the shared function.
  if (comp) {
    const { data: request, error: insErr } = await service
      .from("guided_session_requests")
      .insert({
        user_id: user.id,
        email: user.email,
        full_name: fullName,
        business_name: businessName,
        business_type: businessType,
        description,
      })
      .select("id")
      .single();
    if (insErr || !request) {
      console.error("[api/guided] comp insert failed:", insErr?.message);
      return NextResponse.json({ error: "Couldn't file your request. Try again." }, { status: 500 });
    }
    await confirmGuidedSession({ requestId: request.id, comp: true });
    return NextResponse.json({ comped: true });
  }

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

  // Reuse (or create) the same Stripe customer the subscription checkout
  // uses, so the $10 charge and any future subscription are on one
  // customer and the balance credit applies.
  const { data: existingSub } = await service
    .from("subscriptions")
    .select("stripe_customer_id")
    .eq("user_id", user.id)
    .maybeSingle();

  let customerId = existingSub?.stripe_customer_id ?? null;
  if (!customerId) {
    const customer = await stripe.customers.create({
      email: user.email,
      metadata: { userId: user.id },
    });
    customerId = customer.id;
    await service
      .from("subscriptions")
      .upsert(
        { user_id: user.id, stripe_customer_id: customerId, status: null, plan: null },
        { onConflict: "user_id" },
      );
  }

  const { data: request, error: insErr } = await service
    .from("guided_session_requests")
    .insert({
      user_id: user.id,
      email: user.email,
      full_name: fullName,
      business_name: businessName,
      business_type: businessType,
      description,
      stripe_customer_id: customerId,
    })
    .select("id")
    .single();
  if (insErr || !request) {
    console.error("[api/guided] insert failed:", insErr?.message);
    return NextResponse.json({ error: "Couldn't start your request. Try again." }, { status: 500 });
  }

  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    mode: "payment",
    line_items: [
      GUIDED_PRICE_ID
        ? { price: GUIDED_PRICE_ID, quantity: 1 }
        : {
            quantity: 1,
            price_data: {
              currency: "usd",
              unit_amount: 1000,
              product_data: {
                name: "Guided Build Session",
                description: "One guided session — we work out your app and build it. Credited to your first month.",
              },
            },
          },
    ],
    metadata: { userId: user.id, requestId: request.id },
    payment_intent_data: { metadata: { userId: user.id, requestId: request.id } },
    success_url: `${APP_URL}/guided/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${APP_URL}/guided?cancelled=1`,
  });

  await service
    .from("guided_session_requests")
    .update({ stripe_session_id: session.id })
    .eq("id", request.id);

  return NextResponse.json({ url: session.url });
}
