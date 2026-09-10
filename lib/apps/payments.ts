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
export const PAYMENT_CATEGORIES: readonly AppCategory[] = [
  "invoicing",
  "membership",
  "booking",
  "storefront",
];

export function categoryTakesPayments(category: AppCategory): boolean {
  return PAYMENT_CATEGORIES.includes(category);
}

// When an app has payments_test_mode = true, every Connect call for it runs
// against Stripe test data (STRIPE_TEST_SECRET_KEY) so a tester can walk the
// whole flow with no real money. Falls back to live if the test key is unset.
function platformStripe(testMode = false): Stripe {
  const key =
    testMode && process.env.STRIPE_TEST_SECRET_KEY
      ? process.env.STRIPE_TEST_SECRET_KEY
      : process.env.STRIPE_SECRET_KEY!;
  return new Stripe(key);
}

function appOrigin(): string {
  return process.env.NEXT_PUBLIC_APP_URL || "https://vision-workx.vercel.app";
}

/**
 * Platform's cut of every payment routed through a customer's connected
 * account, as a percent of the transaction (PLATFORM_FEE_PERCENT, e.g.
 * "1" = 1%). Collected as a Stripe application fee on the direct charge.
 * Unset / 0 / out of range → no fee.
 */
export function platformFeePercent(): number {
  const raw = parseFloat(process.env.PLATFORM_FEE_PERCENT ?? "");
  return Number.isFinite(raw) && raw > 0 && raw <= 90 ? raw : 0;
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
    .select("id, stripe_connect_account_id, checkout_secret, payments_test_mode")
    .eq("id", appId)
    .single();
  if (!app) throw new Error("app not found");

  const stripe = platformStripe(!!app.payments_test_mode);

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
export async function refreshConnectStatus(
  accountId: string,
  testMode = false,
): Promise<"none" | "pending" | "active"> {
  const account = await platformStripe(testMode).accounts.retrieve(accountId);
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
  /**
   * mode "payment" only — a real cart. Each entry is one Checkout line
   * item; the platform fee is taken on the total. Overrides `amount` /
   * `productName` when present. Used by the storefront category.
   */
  lineItems?: {
    name: string;
    amountCents: number;
    quantity: number;
    imageUrl?: string;
  }[];
  /** Echoed back on the session so the app can reconcile its own record. */
  metadata?: Record<string, string>;
}

/**
 * Build Stripe Checkout line items + the total from a cart. Pure — split
 * out of createConnectedCheckout so it's unit-testable without Stripe.
 * Clamps quantity to 1..999 and drops non-positive amounts.
 */
export function buildCartLineItems(
  items: NonNullable<CheckoutRequest["lineItems"]>,
  currency: string,
): { lineItems: Stripe.Checkout.SessionCreateParams.LineItem[]; totalCents: number } {
  const clean = items
    .slice(0, 100) // Stripe's line-item ceiling
    .map((i) => ({
      name: (i.name || "Item").slice(0, 250),
      amountCents: Math.round(i.amountCents),
      quantity: Math.min(999, Math.max(1, Math.round(i.quantity || 1))),
      imageUrl: i.imageUrl && /^https:\/\//.test(i.imageUrl) ? i.imageUrl : undefined,
    }))
    .filter((i) => i.amountCents > 0);

  const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = clean.map((i) => ({
    quantity: i.quantity,
    price_data: {
      currency,
      unit_amount: i.amountCents,
      product_data: { name: i.name, ...(i.imageUrl ? { images: [i.imageUrl] } : {}) },
    },
  }));
  const totalCents = clean.reduce((s, i) => s + i.amountCents * i.quantity, 0);
  return { lineItems, totalCents };
}

/**
 * Create a Checkout Session as a direct charge on the app's connected
 * account. Throws if the app isn't connected/active or the request is
 * malformed. Returns the hosted Checkout URL.
 */
export async function createConnectedCheckout(
  app: {
    stripe_connect_account_id: string | null;
    payments_status: string;
    payments_test_mode?: boolean | null;
  },
  req: CheckoutRequest,
): Promise<string> {
  if (!app.stripe_connect_account_id || app.payments_status !== "active") {
    throw new Error("payments are not set up for this app");
  }

  const stripe = platformStripe(!!app.payments_test_mode);
  const currency = (req.currency ?? "usd").toLowerCase();
  const feePct = platformFeePercent();
  const params: Stripe.Checkout.SessionCreateParams = {
    mode: req.mode,
    success_url: req.successUrl,
    cancel_url: req.cancelUrl,
    metadata: req.metadata ?? {},
  };

  if (req.mode === "payment") {
    let totalCents: number;
    if (req.lineItems && req.lineItems.length > 0) {
      // Real cart (storefront).
      const built = buildCartLineItems(req.lineItems, currency);
      if (built.lineItems.length === 0 || built.totalCents < 50) {
        throw new Error("cart total must be at least 50");
      }
      params.line_items = built.lineItems;
      totalCents = built.totalCents;
    } else {
      if (!req.amount || req.amount < 50) throw new Error("amount must be at least 50");
      totalCents = Math.round(req.amount);
      params.line_items = [
        {
          quantity: 1,
          price_data: {
            currency,
            unit_amount: totalCents,
            product_data: { name: req.productName?.slice(0, 250) || "Payment" },
          },
        },
      ];
    }
    if (feePct > 0) {
      params.payment_intent_data = {
        application_fee_amount: Math.round(totalCents * (feePct / 100)),
      };
    }
  } else if (req.priceId) {
    if (feePct > 0) params.subscription_data = { application_fee_percent: feePct };
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
    if (feePct > 0) params.subscription_data = { application_fee_percent: feePct };
  }

  const session = await stripe.checkout.sessions.create(params, {
    stripeAccount: app.stripe_connect_account_id,
  });
  return session.url ?? "";
}

export interface ConnectedTxn {
  id: string;
  /** unix seconds */
  created: number;
  /** integer cents */
  amount: number;
  currency: string;
  /** "succeeded" | "pending" | "failed" */
  status: string;
  paid: boolean;
  refunded: boolean;
  amountRefunded: number;
  description: string | null;
  customerEmail: string | null;
  receiptUrl: string | null;
}

/**
 * List recent charges on the app's connected account, newest first —
 * powers the "Payments history" view inside the generated app. Live read
 * from Stripe (so refunds/disputes made in the Stripe dashboard show up),
 * never a local mirror. `starting_after` is a charge id for pagination.
 */
export async function listConnectedCharges(
  app: {
    stripe_connect_account_id: string | null;
    payments_test_mode?: boolean | null;
  },
  opts: { limit?: number; startingAfter?: string } = {},
): Promise<{ transactions: ConnectedTxn[]; hasMore: boolean }> {
  if (!app.stripe_connect_account_id) {
    return { transactions: [], hasMore: false };
  }

  const stripe = platformStripe(!!app.payments_test_mode);
  const limit = Math.min(Math.max(Math.round(opts.limit ?? 25), 1), 100);

  const res = await stripe.charges.list(
    { limit, ...(opts.startingAfter ? { starting_after: opts.startingAfter } : {}) },
    { stripeAccount: app.stripe_connect_account_id },
  );

  const transactions: ConnectedTxn[] = res.data.map((c) => ({
    id: c.id,
    created: c.created,
    amount: c.amount,
    currency: c.currency,
    status: c.status,
    paid: c.paid && c.status === "succeeded",
    refunded: c.refunded,
    amountRefunded: c.amount_refunded,
    description: c.description ?? null,
    customerEmail: c.billing_details?.email ?? c.receipt_email ?? null,
    receiptUrl: c.receipt_url ?? null,
  }));

  return { transactions, hasMore: res.has_more };
}

/** Look up a session on the connected account and report whether it's paid. */
export async function checkoutSessionPaid(
  accountId: string,
  sessionId: string,
  testMode = false,
): Promise<{ paid: boolean; metadata: Record<string, string> }> {
  const session = await platformStripe(testMode).checkout.sessions.retrieve(
    sessionId,
    {},
    { stripeAccount: accountId },
  );
  return {
    paid: session.payment_status === "paid" || session.status === "complete",
    metadata: (session.metadata as Record<string, string>) ?? {},
  };
}
