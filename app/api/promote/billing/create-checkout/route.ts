import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { createServerClient, createServiceClient } from "@/lib/supabase";
import type { PromotePlan } from "@/lib/database.types";

const PRICE_ID_BY_PLAN: Record<PromotePlan, string | undefined> = {
  starter: process.env.STRIPE_PROMOTE_STARTER_PRICE_ID,
  growth: process.env.STRIPE_PROMOTE_GROWTH_PRICE_ID,
  pro: process.env.STRIPE_PROMOTE_PRO_PRICE_ID,
};

export async function POST(req: NextRequest) {
  const supabase = createServerClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { plan?: PromotePlan };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const plan = body.plan;
  if (!plan || !["starter", "growth", "pro"].includes(plan)) {
    return NextResponse.json({ error: "Invalid plan" }, { status: 400 });
  }

  const priceId = PRICE_ID_BY_PLAN[plan];
  if (!priceId) {
    return NextResponse.json({ error: "Plan not configured" }, { status: 500 });
  }

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
  const serviceClient = createServiceClient();

  const { data: existingSub } = await serviceClient
    .from("promote_subscriptions")
    .select("stripe_customer_id")
    .eq("user_id", user.id)
    .maybeSingle();

  let stripeCustomerId = existingSub?.stripe_customer_id ?? null;

  if (!stripeCustomerId) {
    const customer = await stripe.customers.create({
      email: user.email,
      metadata: { userId: user.id, product: "promote" },
    });
    stripeCustomerId = customer.id;

    await serviceClient.from("promote_subscriptions").upsert(
      { user_id: user.id, stripe_customer_id: stripeCustomerId, status: null, plan: null },
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
      metadata: { userId: user.id, product: "promote" },
    },
    metadata: { userId: user.id, product: "promote" },
    success_url: `${appUrl}/promote/dashboard/settings?checkout=success`,
    cancel_url: `${appUrl}/promote/dashboard/settings`,
    allow_promotion_codes: true,
  });

  return NextResponse.json({ url: session.url });
}
