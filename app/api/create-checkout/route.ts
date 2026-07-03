import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { createServerClient, createServiceClient } from "@/lib/supabase";

export async function POST(req: NextRequest) {
  const supabase = createServerClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { priceId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { priceId } = body;
  if (!priceId) {
    return NextResponse.json({ error: "Missing priceId" }, { status: 400 });
  }

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
  const serviceClient = createServiceClient();

  // Look up existing Stripe customer ID
  const { data: existingSub } = await serviceClient
    .from("subscriptions")
    .select("stripe_customer_id")
    .eq("user_id", user.id)
    .maybeSingle();

  let stripeCustomerId = existingSub?.stripe_customer_id ?? null;

  // Create a Stripe customer if one doesn't exist yet
  if (!stripeCustomerId) {
    const customer = await stripe.customers.create({
      email: user.email,
      metadata: { userId: user.id },
    });
    stripeCustomerId = customer.id;

    // Persist the customer ID immediately so future requests can find it
    await serviceClient.from("subscriptions").upsert(
      {
        user_id: user.id,
        stripe_customer_id: stripeCustomerId,
        status: null,
        plan: null,
      },
      { onConflict: "user_id" }
    );
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

  const session = await stripe.checkout.sessions.create({
    customer: stripeCustomerId,
    mode: "subscription",
    line_items: [{ price: priceId, quantity: 1 }],
    subscription_data: {
      trial_period_days: 14,
      metadata: { userId: user.id },
    },
    metadata: { userId: user.id },
    success_url: `${appUrl}/billing?checkout=success`,
    cancel_url: `${appUrl}/billing`,
    allow_promotion_codes: true,
  });

  return NextResponse.json({ url: session.url });
}
