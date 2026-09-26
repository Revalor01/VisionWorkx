// Stripe Connect for module workspaces -- lets a workspace accept payments
// FROM ITS OWN CUSTOMERS (deposits, invoices), separate from the platform
// subscription billing in lib/modules/billing.ts (that's the workspace
// paying VisionWorkx; this is the workspace's customers paying the
// workspace). Ported from lib/apps/payments.ts's proven pattern -- same
// Standard connected accounts, direct charges, and application fee -- just
// rescoped from `apps` to `vw_workspaces`. Copied rather than shared since
// the two live in different Supabase projects with different service
// clients.

import Stripe from "stripe";
import { modulesServiceClient } from "./supabase";

function platformStripe(testMode = false): Stripe {
  const key = testMode && process.env.STRIPE_TEST_SECRET_KEY ? process.env.STRIPE_TEST_SECRET_KEY : process.env.STRIPE_SECRET_KEY!;
  return new Stripe(key);
}

function appOrigin(): string {
  return process.env.NEXT_PUBLIC_APP_URL || "https://vision-workx.vercel.app";
}

/** VisionWorkx's cut of a workspace's customer payments, as a percent. Same env var the app-builder platform fee uses. */
export function platformFeePercent(): number {
  const raw = parseFloat(process.env.PLATFORM_FEE_PERCENT ?? "");
  return Number.isFinite(raw) && raw > 0 && raw <= 90 ? raw : 0;
}

/**
 * Ensure the workspace has a Standard connected account, then return a
 * fresh onboarding link. Account links are single-use and short-lived, so
 * this always mints a new one.
 */
export async function startConnectOnboarding(workspaceId: string, slug: string, ownerEmail: string | null): Promise<string> {
  const db = modulesServiceClient();
  const { data: ws } = await db
    .from("vw_workspaces")
    .select("id, stripe_connect_account_id, connect_payments_test_mode")
    .eq("id", workspaceId)
    .single();
  if (!ws) throw new Error("workspace not found");

  const stripe = platformStripe(!!ws.connect_payments_test_mode);

  let accountId = ws.stripe_connect_account_id as string | null;
  if (!accountId) {
    const account = await stripe.accounts.create({
      type: "standard",
      email: ownerEmail ?? undefined,
      metadata: { vw_workspace_id: workspaceId },
    });
    accountId = account.id;
    await db.from("vw_workspaces").update({ stripe_connect_account_id: accountId, connect_payments_status: "pending" }).eq("id", workspaceId);
  }

  const base = appOrigin();
  const returnUrl = `${base}/workspace/${slug}/payments?connect=return`;
  const link = await stripe.accountLinks.create({
    account: accountId,
    refresh_url: `${base}/workspace/${slug}/payments?connect=refresh`,
    return_url: returnUrl,
    type: "account_onboarding",
  });
  return link.url;
}

/** Reconcile connect_payments_status from a Stripe Account object (account.updated webhook, or an on-demand retrieve). */
export async function syncConnectAccount(account: Stripe.Account): Promise<boolean> {
  const workspaceId = account.metadata?.vw_workspace_id;
  if (!workspaceId) return false;
  const status: "active" | "pending" = account.charges_enabled ? "active" : "pending";
  const { error } = await modulesServiceClient().from("vw_workspaces").update({ connect_payments_status: status }).eq("id", workspaceId);
  if (error) console.error("[modules/connect] sync failed:", error.message);
  return true;
}

/** Pull the account fresh and reconcile (used by the connect status route). */
export async function refreshConnectStatus(accountId: string, testMode = false): Promise<"none" | "pending" | "active"> {
  const account = await platformStripe(testMode).accounts.retrieve(accountId);
  await syncConnectAccount(account);
  return account.charges_enabled ? "active" : "pending";
}

export interface WorkspaceCheckoutRequest {
  successUrl: string;
  cancelUrl: string;
  /** Smallest currency unit (cents for USD). */
  amountCents: number;
  currency?: string;
  /** Shown on the Stripe Checkout page. */
  productName: string;
  /** Echoed back on the session so a webhook can reconcile. */
  metadata: Record<string, string>;
}

/**
 * Create a Checkout Session as a direct charge on the workspace's connected
 * account. Throws if the workspace isn't connected/active or the amount is
 * too small. Returns the hosted Checkout URL.
 */
export async function createWorkspaceCheckout(
  workspace: { stripe_connect_account_id: string | null; connect_payments_status: string; connect_payments_test_mode?: boolean | null },
  req: WorkspaceCheckoutRequest,
): Promise<{ url: string; sessionId: string }> {
  if (!workspace.stripe_connect_account_id || workspace.connect_payments_status !== "active") {
    throw new Error("payments aren't set up for this workspace yet");
  }
  const amountCents = Math.round(req.amountCents);
  if (!amountCents || amountCents < 50) throw new Error("amount must be at least 50 cents");

  const stripe = platformStripe(!!workspace.connect_payments_test_mode);
  const currency = (req.currency ?? "usd").toLowerCase();
  const feePct = platformFeePercent();

  const session = await stripe.checkout.sessions.create(
    {
      mode: "payment",
      success_url: req.successUrl,
      cancel_url: req.cancelUrl,
      metadata: req.metadata,
      line_items: [
        {
          quantity: 1,
          price_data: { currency, unit_amount: amountCents, product_data: { name: req.productName.slice(0, 250) } },
        },
      ],
      ...(feePct > 0 ? { payment_intent_data: { application_fee_amount: Math.round(amountCents * (feePct / 100)) } } : {}),
    },
    { stripeAccount: workspace.stripe_connect_account_id },
  );
  if (!session.url) throw new Error("Stripe didn't return a checkout URL");
  return { url: session.url, sessionId: session.id };
}

/** Look up a session on the connected account and report whether it's paid. */
export async function checkoutSessionPaid(accountId: string, sessionId: string, testMode = false): Promise<boolean> {
  const session = await platformStripe(testMode).checkout.sessions.retrieve(sessionId, {}, { stripeAccount: accountId });
  return session.payment_status === "paid" || session.status === "complete";
}

/**
 * On-demand payment confirmation for a module-payment success page. Primary
 * mechanism (not just a webhook fallback) -- mirrors the pattern
 * app/api/apps/[appId]/checkout/route.ts already uses for connected-account
 * Checkout Sessions, since Connect webhook event forwarding may not include
 * checkout.session.completed. Safe to call repeatedly (idempotent).
 */
export async function confirmSubmissionPayment(sessionId: string): Promise<{ paid: boolean }> {
  if (!sessionId) return { paid: false };
  const db = modulesServiceClient();
  const { data: sub } = await db
    .from("vw_submissions")
    .select("id, workspace_id, payment_status")
    .eq("stripe_checkout_session_id", sessionId)
    .maybeSingle();
  if (!sub) return { paid: false };
  if (sub.payment_status === "paid") return { paid: true };

  const { data: ws } = await db
    .from("vw_workspaces")
    .select("stripe_connect_account_id, connect_payments_test_mode")
    .eq("id", sub.workspace_id)
    .single();
  if (!ws?.stripe_connect_account_id) return { paid: false };

  try {
    const paid = await checkoutSessionPaid(ws.stripe_connect_account_id, sessionId, !!ws.connect_payments_test_mode);
    if (paid) await db.from("vw_submissions").update({ payment_status: "paid" }).eq("id", sub.id);
    return { paid };
  } catch (err) {
    console.error("[modules/connect] confirmSubmissionPayment failed:", err instanceof Error ? err.message : err);
    return { paid: false };
  }
}
