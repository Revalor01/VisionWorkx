import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { createServiceClient } from "@/lib/supabase";
import type { PromotePlan, SubscriptionStatus } from "@/lib/database.types";

// Separate endpoint/webhook config from app/api/webhooks/stripe/route.ts —
// this product has its own price IDs and writes to promote_subscriptions,
// not the core `subscriptions` table. See supabase/migrations/20240101000016_promote.sql
// header note for why the two are kept apart.

const STRIPE_STATUS_MAP: Record<string, SubscriptionStatus> = {
  active: "active",
  trialing: "trialing",
  past_due: "past_due",
  canceled: "cancelled",
  incomplete: "past_due",
  incomplete_expired: "cancelled",
  unpaid: "past_due",
  paused: "cancelled",
};

function getPlanFromPriceId(priceId: string): PromotePlan | null {
  const map: Record<string, PromotePlan> = {
    [process.env.STRIPE_PROMOTE_STARTER_PRICE_ID ?? ""]: "starter",
    [process.env.STRIPE_PROMOTE_GROWTH_PRICE_ID ?? ""]: "growth",
    [process.env.STRIPE_PROMOTE_PRO_PRICE_ID ?? ""]: "pro",
  };
  return map[priceId] ?? null;
}

export async function POST(req: NextRequest) {
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
  const body = await req.text();
  const signature = req.headers.get("stripe-signature");

  if (!signature) {
    return NextResponse.json({ error: "Missing stripe-signature" }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, signature, process.env.STRIPE_PROMOTE_WEBHOOK_SECRET!);
  } catch (err) {
    console.error("[stripe-promote webhook] signature verification failed:", err);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  const serviceClient = createServiceClient();

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const userId = session.metadata?.userId;
        const stripeCustomerId = typeof session.customer === "string" ? session.customer : null;
        const stripeSubscriptionId = typeof session.subscription === "string" ? session.subscription : null;

        if (!userId || !stripeSubscriptionId) break;

        const stripeSub = await stripe.subscriptions.retrieve(stripeSubscriptionId);
        const firstItem = stripeSub.items.data[0];
        const priceId = firstItem?.price.id ?? "";
        const plan = getPlanFromPriceId(priceId);
        const status = STRIPE_STATUS_MAP[stripeSub.status] ?? ("active" as SubscriptionStatus);
        const periodEnd = firstItem?.current_period_end
          ? new Date(firstItem.current_period_end * 1000).toISOString()
          : null;

        await serviceClient.from("promote_subscriptions").upsert(
          {
            user_id: userId,
            stripe_customer_id: stripeCustomerId,
            stripe_subscription_id: stripeSubscriptionId,
            plan,
            status,
            current_period_end: periodEnd,
          },
          { onConflict: "user_id" }
        );

        console.log(`[stripe-promote] checkout complete — user ${userId}, plan ${plan}, status ${status}`);
        break;
      }

      case "customer.subscription.updated": {
        const sub = event.data.object as Stripe.Subscription;
        const stripeCustomerId = typeof sub.customer === "string" ? sub.customer : null;
        if (!stripeCustomerId) break;

        const firstItem = sub.items.data[0];
        const priceId = firstItem?.price.id ?? "";
        const plan = getPlanFromPriceId(priceId);
        const status = STRIPE_STATUS_MAP[sub.status] ?? ("active" as SubscriptionStatus);
        const periodEnd = firstItem?.current_period_end
          ? new Date(firstItem.current_period_end * 1000).toISOString()
          : null;

        const { data: existingSub } = await serviceClient
          .from("promote_subscriptions")
          .select("user_id")
          .eq("stripe_customer_id", stripeCustomerId)
          .maybeSingle();

        if (!existingSub?.user_id) break;

        await serviceClient
          .from("promote_subscriptions")
          .update({ stripe_subscription_id: sub.id, plan, status, current_period_end: periodEnd })
          .eq("user_id", existingSub.user_id);

        console.log(`[stripe-promote] subscription updated — user ${existingSub.user_id}, plan ${plan}, status ${status}`);
        break;
      }

      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;
        const stripeCustomerId = typeof sub.customer === "string" ? sub.customer : null;
        if (!stripeCustomerId) break;

        const { data: existingSub } = await serviceClient
          .from("promote_subscriptions")
          .select("user_id")
          .eq("stripe_customer_id", stripeCustomerId)
          .maybeSingle();

        if (!existingSub?.user_id) break;

        await serviceClient
          .from("promote_subscriptions")
          .update({ status: "cancelled", plan: null })
          .eq("user_id", existingSub.user_id);

        console.log(`[stripe-promote] subscription deleted — user ${existingSub.user_id}`);
        break;
      }

      default:
        break;
    }
  } catch (err) {
    console.error(`[stripe-promote webhook] error handling ${event.type}:`, err);
  }

  return NextResponse.json({ received: true });
}
