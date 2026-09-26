import Stripe from "stripe";
import { modulesServiceClient } from "./supabase";
import { PLANS, TRIAL_DAYS, type ModulePlan } from "./plans";

// Stripe billing for module workspaces. Reuses VisionWorkx's existing live
// prices (same $59/$129/$299, monthly + annual). Subscriptions are tagged
// with metadata.vw_workspace_id so the shared webhook can route them here.

export function stripe(): Stripe {
  return new Stripe(process.env.STRIPE_SECRET_KEY!);
}

export type Interval = "monthly" | "annual";

export function priceIdFor(plan: ModulePlan, interval: Interval): string | undefined {
  const env: Record<string, string | undefined> = {
    "starter:monthly": process.env.STRIPE_STARTER_PRICE_ID,
    "growth:monthly": process.env.STRIPE_GROWTH_PRICE_ID,
    "pro:monthly": process.env.STRIPE_PRO_PRICE_ID,
    "starter:annual": process.env.STRIPE_STARTER_ANNUAL_PRICE_ID,
    "growth:annual": process.env.STRIPE_GROWTH_ANNUAL_PRICE_ID,
    "pro:annual": process.env.STRIPE_PRO_ANNUAL_PRICE_ID,
  };
  return env[`${plan}:${interval}`] || undefined;
}

export function planFromPriceId(priceId: string | undefined): ModulePlan | null {
  if (!priceId) return null;
  for (const plan of PLANS) {
    if (priceId === priceIdFor(plan, "monthly") || priceId === priceIdFor(plan, "annual")) return plan;
  }
  return null;
}

/** Stripe subscription status -> our billing_status. */
export function billingStatusFrom(status: Stripe.Subscription.Status): "trialing" | "active" | "past_due" | "canceled" | "none" {
  switch (status) {
    case "trialing":
      return "trialing";
    case "active":
      return "active";
    case "past_due":
    case "unpaid":
      return "past_due";
    case "incomplete":
      return "none"; // first payment not completed yet
    default:
      return "canceled"; // canceled, incomplete_expired, paused
  }
}

export function trialDaysForNewSubscription(ws: { stripe_subscription_id: string | null; billing_status: string }): number | undefined {
  // One trial per workspace: only if it has never had a subscription.
  return !ws.stripe_subscription_id && ws.billing_status === "none" ? TRIAL_DAYS : undefined;
}

/** Mirror a Stripe subscription onto its workspace. Returns false if it isn't a module workspace subscription. */
export async function syncWorkspaceSubscription(sub: Stripe.Subscription): Promise<boolean> {
  const workspaceId = sub.metadata?.vw_workspace_id;
  if (!workspaceId) return false;
  const item = sub.items.data[0];
  const plan = planFromPriceId(item?.price.id);
  const patch: Record<string, unknown> = {
    billing_status: billingStatusFrom(sub.status),
    stripe_subscription_id: sub.id,
    stripe_customer_id: typeof sub.customer === "string" ? sub.customer : sub.customer.id,
    trial_ends_at: sub.trial_end ? new Date(sub.trial_end * 1000).toISOString() : null,
    current_period_end: item?.current_period_end ? new Date(item.current_period_end * 1000).toISOString() : null,
  };
  if (plan) patch.plan = plan;
  const { error } = await modulesServiceClient()
    .from("vw_workspaces")
    .update(patch)
    .eq("id", workspaceId)
    .neq("billing_status", "comped"); // never overwrite internal/comped workspaces
  if (error) console.error("[vw billing] sync failed:", error.message);
  return true;
}
