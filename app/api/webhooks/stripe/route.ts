import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { createServiceClient } from "@/lib/supabase";
import { syncConnectAccount } from "@/lib/apps/payments";
import { confirmGuidedSession } from "@/lib/apps/guidedSession";
import { sendBillingEmail, lookupUserEmails } from "@/lib/billing/notify";
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
    [process.env.STRIPE_STARTER_ANNUAL_PRICE_ID ?? ""]: "starter",
    [process.env.STRIPE_GROWTH_ANNUAL_PRICE_ID ?? ""]: "growth",
    [process.env.STRIPE_PRO_ANNUAL_PRICE_ID ?? ""]: "pro",
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

  // Verify against the live signing secret first, then the test one (set
  // when a Connect test-mode endpoint is configured). Test events for
  // account.updated / checkout.session.completed run through the same
  // handler — they're keyed on our own IDs, not on livemode.
  const secrets = [
    process.env.STRIPE_WEBHOOK_SECRET,
    process.env.STRIPE_TEST_WEBHOOK_SECRET,
  ].filter((s): s is string => !!s);

  let event: Stripe.Event | null = null;
  for (const secret of secrets) {
    try {
      event = stripe.webhooks.constructEvent(body, signature, secret);
      break;
    } catch {
      /* try the next secret */
    }
  }
  if (!event) {
    console.error("[stripe webhook] signature verification failed for all secrets");
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  const serviceClient = createServiceClient();

  try {
    switch (event.type) {
      // ── New checkout completed ──────────────────────────────────
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const userId = session.metadata?.userId;

        // One-time Guided Build Session payment — no subscription.
        if (
          session.mode === "payment" &&
          session.payment_status === "paid" &&
          session.metadata?.requestId
        ) {
          const status = await confirmGuidedSession({
            stripe,
            requestId: session.metadata.requestId,
          });
          console.log(
            `[stripe] guided session ${status} — request ${session.metadata.requestId}`
          );
          break;
        }

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

      // ── Renewal charge failed — dunning ────────────────────────
      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice;
        const stripeCustomerId =
          typeof invoice.customer === "string" ? invoice.customer : null;
        if (!stripeCustomerId) break;

        const { data: sub } = await serviceClient
          .from("subscriptions")
          .select("id, user_id, payment_failed_notified_at")
          .eq("stripe_customer_id", stripeCustomerId)
          .maybeSingle();
        if (!sub?.user_id) break;

        // Once per failure episode — cleared on the next successful payment.
        if (sub.payment_failed_notified_at) break;

        const emails = await lookupUserEmails([sub.user_id]);
        const to = emails[sub.user_id];
        if (to) {
          await sendBillingEmail({
            to,
            subject: "Your Vision Workx payment didn't go through",
            heading: "We couldn't process your payment",
            body: [
              "The card on file was declined on your latest Vision Workx charge. Your apps are still live for now.",
              "Update your card on the billing page and we'll retry automatically. If it keeps failing, the subscription will pause until it's sorted.",
            ],
            ctaLabel: "Update payment method",
          });
        }
        await serviceClient
          .from("subscriptions")
          .update({ payment_failed_notified_at: new Date().toISOString() })
          .eq("id", sub.id);
        console.log(`[stripe] payment failed — user ${sub.user_id}, dunning sent=${!!to}`);
        break;
      }

      // ── Payment succeeded — clear any dunning flag ─────────────
      case "invoice.paid": {
        const invoice = event.data.object as Stripe.Invoice;
        const stripeCustomerId =
          typeof invoice.customer === "string" ? invoice.customer : null;
        if (!stripeCustomerId) break;
        await serviceClient
          .from("subscriptions")
          .update({ payment_failed_notified_at: null })
          .eq("stripe_customer_id", stripeCustomerId)
          .not("payment_failed_notified_at", "is", null);
        break;
      }

      // ── Connected account state changed (Phase 2 payments) ──────
      // Delivered for connected accounts when the endpoint is configured
      // to listen on Connect; also fires for the platform account itself,
      // which syncConnectAccount safely ignores (no matching app row).
      case "account.updated": {
        await syncConnectAccount(event.data.object as Stripe.Account);
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
