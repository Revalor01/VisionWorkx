import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { createServiceClient } from "@/lib/supabase";
import type { Plan, SubscriptionStatus } from "@/lib/database.types";

// Stripe uses "canceled"; our schema uses "cancelled"
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

function getPlanFromPriceId(priceId: string): Exclude<Plan, "free"> | null {
  const map: Record<string, Exclude<Plan, "free">> = {
    [process.env.STRIPE_STARTER_PRICE_ID ?? ""]: "starter",
    [process.env.STRIPE_GROWTH_PRICE_ID ?? ""]: "growth",
    [process.env.STRIPE_PRO_PRICE_ID ?? ""]: "pro",
  };
  return map[priceId] ?? null;
}

export async function POST(req: NextRequest) {
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
  const body = await req.text();
  const signature = req.headers.get("stripe-signature");

  if (!signature) {
    return NextResponse.json(
      { error: "Missing stripe-signature" },
      { status: 400 }
    );
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(
      body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET!
    );
  } catch (err) {
    console.error("[stripe webhook] signature verification failed:", err);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  const serviceClient = createServiceClient();

  try {
    switch (event.type) {
      // ── New checkout completed ──────────────────────────────────
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const userId = session.metadata?.userId;
        const stripeCustomerId =
          typeof session.customer === "string" ? session.customer : null;
        const stripeSubscriptionId =
          typeof session.subscription === "string"
            ? session.subscription
            : null;

        if (!userId || !stripeSubscriptionId) break;

        // Fetch subscription details to get plan and status
        const stripeSub = await stripe.subscriptions.retrieve(
          stripeSubscriptionId
        );
        const firstItem = stripeSub.items.data[0];
        const priceId = firstItem?.price.id ?? "";
        const plan = getPlanFromPriceId(priceId);
        const status =
          STRIPE_STATUS_MAP[stripeSub.status] ?? ("active" as SubscriptionStatus);
        const periodEnd = firstItem?.current_period_end
          ? new Date(firstItem.current_period_end * 1000).toISOString()
          : null;

        await Promise.all([
          // Upsert subscription record
          serviceClient.from("subscriptions").upsert(
            {
              user_id: userId,
              stripe_customer_id: stripeCustomerId,
              stripe_subscription_id: stripeSubscriptionId,
              plan,
              status,
              current_period_end: periodEnd,
            },
            { onConflict: "user_id" }
          ),
          // Sync plan to profile
          plan
            ? serviceClient
                .from("profiles")
                .update({ plan })
                .eq("id", userId)
            : Promise.resolve(),
        ]);

        console.log(
          `[stripe] checkout complete — user ${userId}, plan ${plan}, status ${status}`
        );
        break;
      }

      // ── Subscription updated (upgrade, downgrade, renewal) ─────
      case "customer.subscription.updated": {
        const sub = event.data.object as Stripe.Subscription;
        const stripeCustomerId =
          typeof sub.customer === "string" ? sub.customer : null;
        if (!stripeCustomerId) break;

        const firstItem = sub.items.data[0];
        const priceId = firstItem?.price.id ?? "";
        const plan = getPlanFromPriceId(priceId);
        const status =
          STRIPE_STATUS_MAP[sub.status] ?? ("active" as SubscriptionStatus);
        const periodEnd = firstItem?.current_period_end
          ? new Date(firstItem.current_period_end * 1000).toISOString()
          : null;

        // Look up our user by customer ID
        const { data: existingSub } = await serviceClient
          .from("subscriptions")
          .select("user_id")
          .eq("stripe_customer_id", stripeCustomerId)
          .maybeSingle();

        if (!existingSub?.user_id) break;
        const userId = existingSub.user_id;

        await Promise.all([
          serviceClient
            .from("subscriptions")
            .update({
              stripe_subscription_id: sub.id,
              plan,
              status,
              current_period_end: periodEnd,
            })
            .eq("user_id", userId),
          // Sync plan to profile (downgrade to 'free' if cancelled)
          serviceClient
            .from("profiles")
            .update({ plan: plan ?? "free" })
            .eq("id", userId),
        ]);

        console.log(
          `[stripe] subscription updated — user ${userId}, plan ${plan}, status ${status}`
        );
        break;
      }

      // ── Subscription cancelled ──────────────────────────────────
      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;
        const stripeCustomerId =
          typeof sub.customer === "string" ? sub.customer : null;
        if (!stripeCustomerId) break;

        const { data: existingSub } = await serviceClient
          .from("subscriptions")
          .select("user_id")
          .eq("stripe_customer_id", stripeCustomerId)
          .maybeSingle();

        if (!existingSub?.user_id) break;
        const userId = existingSub.user_id;

        await Promise.all([
          serviceClient
            .from("subscriptions")
            .update({ status: "cancelled", plan: null })
            .eq("user_id", userId),
          serviceClient
            .from("profiles")
            .update({ plan: "free" })
            .eq("id", userId),
        ]);

        console.log(`[stripe] subscription deleted — user ${userId}`);
        break;
      }

      default:
        // No-op for unhandled events
        break;
    }
  } catch (err) {
    console.error(`[stripe webhook] error handling ${event.type}:`, err);
    // Return 200 so Stripe doesn't retry — log and investigate separately
  }

  return NextResponse.json({ received: true });
}
