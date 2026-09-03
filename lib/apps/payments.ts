// Phase 2: Stripe Connect for generated apps. Each app that takes money
// gets its own Standard connected account — the business owns the account,
// the customers, and the funds. VisionWorkx (the platform) only creates
// Checkout sessions "on behalf of" that account (direct charges).

import { randomBytes } from "crypto";
import Stripe from "stripe";
import { createServiceClient } from "@/lib/supabase";
import type { AppCategory } from "@/lib/database.types";

// Categories where "collect payments online" is part of the pitch.
// "booking" is here for deposits at booking time.
export const PAYMENT_CATEGORIES: readonly AppCategory[] = ["invoicing", "membership", "booking"];

export function categoryTakesPayments(category: AppCategory): boolean {
  return PAYMENT_CATEGORIES.includes(category);
}

function platformStripe(): Stripe {
  return new Stripe(process.env.STRIPE_SECRET_KEY!);
}

function appOrigin(): string {
  return process.env.NEXT_PUBLIC_APP_URL || "https://vision-workx.vercel.app";
}

/**
 * Ensure the app has a Standard connected account and a checkout secret,
 * then return a fresh Stripe onboarding link. Called every time the owner
 * clicks "set up" / "finish setup" — account links are single-use and
 * short-lived, so we always mint a new one.
 */
export async function startConnectOnboarding(
  appId: string,
  ownerEmail: string | null,
): Promise<string> {
  const service = createServiceClient();
  const { data: app } = await service
    .from("apps")
    .select("id, stripe_connect_account_id, checkout_secret")
    .eq("id", appId)
    .single();
  if (!app) throw new Error("app not found");

  const stripe = platformStripe();

  let accountId = app.stripe_connect_account_id;
  if (!accountId) {
    const account = await stripe.accounts.create({
      type: "standard",
      email: ownerEmail ?? undefined,
      metadata: { visionworkx_app_id: appId },
    });
    accountId = account.id;
    await service
      .from("apps")
      .update({
        stripe_connect_account_id: accountId,
        payments_status: "pending",
        checkout_secret: app.checkout_secret ?? randomBytes(24).toString("hex"),
      })
      .eq("id", appId);
  } else if (!app.checkout_secret) {
    await service
      .from("apps")
      .update({ checkout_secret: randomBytes(24).toString("hex") })
      .eq("id", appId);
  }

  const returnUrl = `${appOrigin()}/apps/${appId}/settings?payments=return`;
  const link = await stripe.accountLinks.create({
    account: accountId,
    refresh_url: `${appOrigin()}/apps/${appId}/settings?payments=refresh`,
    return_url: returnUrl,
    type: "account_onboarding",
  });
  return link.url;
}

/**
 * Reconcile our payments_status from a Stripe Account object (from an
 * account.updated webhook, or an on-demand retrieve). Sets "active" once
 * the account can actually take charges.
 */
export async function syncConnectAccount(account: Stripe.Account): Promise<void> {
  const appId = account.metadata?.visionworkx_app_id;
  const service = createServiceClient();

  const status: "active" | "pending" = account.charges_enabled ? "active" : "pending";

  const query = service.from("apps").update({ payments_status: status });
  // Prefer the metadata link; fall back to matching the stored account id.
  if (appId) {
    await query.eq("id", appId);
  } else {
    await query.eq("stripe_connect_account_id", account.id);
  }
}

/** Pull the account fresh and reconcile (used by the connect route). */
export async function refreshConnectStatus(accountId: string): Promise<"none" | "pending" | "active"> {
  const account = await platformStripe().accounts.retrieve(accountId);
  await syncConnectAccount(account);
  return account.charges_enabled ? "active" : "pending";
}

export interface CheckoutRequest {
  mode: "payment" | "subscription";
  successUrl: string;
  cancelUrl: string;
  /** For mode "payment": a single amount in the smallest currency unit. */
  amount?: number;
  currency?: string;
  /** Human label shown on the Stripe page for a one-off payment. */
  productName?: string;
  /** For mode "subscription": an existing Price id on the connected account. */
  priceId?: string;
  /** For mode "subscription" without a priceId: billing interval (default month). */
  interval?: "day" | "week" | "month" | "year";
  /** Echoed back on the session so the app can reconcile its own record. */
  metadata?: Record<string, string>;
}

/**
 * Create a Checkout Session as a direct charge on the app's connected
 * account. Throws if the app isn't connected/active or the request is
 * malformed. Returns the hosted Checkout URL.
 */
export async function createConnectedCheckout(
  app: { stripe_connect_account_id: string | null; payments_status: string },
  req: CheckoutRequest,
): Promise<string> {
  if (!app.stripe_connect_account_id || app.payments_status !== "active") {
    throw new Error("payments are not set up for this app");
  }

  const currency = (req.currency ?? "usd").toLowerCase();
  const params: Stripe.Checkout.SessionCreateParams = {
    mode: req.mode,
    success_url: req.successUrl,
    cancel_url: req.cancelUrl,
    metadata: req.metadata ?? {},
  };

  if (req.mode === "payment") {
    if (!req.amount || req.amount < 50) throw new Error("amount must be at least 50");
    params.line_items = [
      {
        quantity: 1,
        price_data: {
          currency,
          unit_amount: Math.round(req.amount),
          product_data: { name: req.productName?.slice(0, 250) || "Payment" },
        },
      },
    ];
  } else if (req.priceId) {
    params.line_items = [{ price: req.priceId, quantity: 1 }];
  } else {
    // No pre-made Price — build a recurring one inline (Checkout supports
    // price_data.recurring in subscription mode).
    if (!req.amount || req.amount < 50) throw new Error("amount must be at least 50");
    params.line_items = [
      {
        quantity: 1,
        price_data: {
          currency,
          unit_amount: Math.round(req.amount),
          recurring: { interval: req.interval ?? "month" },
          product_data: { name: req.productName?.slice(0, 250) || "Membership" },
        },
      },
    ];
  }

  const session = await platformStripe().checkout.sessions.create(params, {
    stripeAccount: app.stripe_connect_account_id,
  });
  return session.url ?? "";
}

/** Look up a session on the connected account and report whether it's paid. */
export async function checkoutSessionPaid(
  accountId: string,
  sessionId: string,
): Promise<{ paid: boolean; metadata: Record<string, string> }> {
  const session = await platformStripe().checkout.sessions.retrieve(
    sessionId,
    {},
    { stripeAccount: accountId },
  );
  return {
    paid: session.payment_status === "paid" || session.status === "complete",
    metadata: (session.metadata as Record<string, string>) ?? {},
  };
}
