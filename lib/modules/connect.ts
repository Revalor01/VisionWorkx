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
import { EMBED_ORIGIN } from "./constants";
import { submissionEmail } from "./submissionEmail";

function platformStripe(testMode = false): Stripe {
  const key = testMode && process.env.STRIPE_TEST_SECRET_KEY ? process.env.STRIPE_TEST_SECRET_KEY : process.env.STRIPE_SECRET_KEY!;
  return new Stripe(key);
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

  // Back to the Billing page (where the Connect card lives) on the workspace
  // host, where the owner's sign-in cookie is -- not the app-builder origin.
  const base = process.env.NEXT_PUBLIC_MODULES_EMBED_ORIGIN ?? EMBED_ORIGIN;
  const returnUrl = `${base}/workspace/${slug}/billing?connect=return`;
  const link = await stripe.accountLinks.create({
    account: accountId,
    refresh_url: `${base}/workspace/${slug}/billing?connect=refresh`,
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
    if (paid) await markSubmissionPaid(sub.id);
    return { paid };
  } catch (err) {
    console.error("[modules/connect] confirmSubmissionPayment failed:", err instanceof Error ? err.message : err);
    return { paid: false };
  }
}

/**
 * Flip a submission to paid (once) and tell the business. Shared by the
 * success pages and the webhook; whichever gets there first sends the email,
 * the other finds the row already paid and does nothing.
 */
export async function markSubmissionPaid(submissionId: string): Promise<void> {
  const db = modulesServiceClient();
  const { data: rows, error } = await db
    .from("vw_submissions")
    .update({ payment_status: "paid" })
    .eq("id", submissionId)
    .neq("payment_status", "paid")
    .select("id, workspace_id, module_id, data, payment_amount_cents");
  if (error) {
    console.error("[modules/connect] mark paid failed:", error.message);
    return;
  }
  const sub = rows?.[0];
  if (!sub) return; // already paid -- someone else sent the notice

  const [{ data: ws }, { data: mod }] = await Promise.all([
    db.from("vw_workspaces").select("name, slug, notification_email").eq("id", sub.workspace_id).single(),
    db.from("vw_modules").select("name").eq("id", sub.module_id).maybeSingle(),
  ]);
  const key = process.env.RESEND_API_KEY;
  if (!ws?.notification_email || !key) return;
  const data = (sub.data ?? {}) as Record<string, unknown>;
  const who = (typeof data.name === "string" && data.name.trim()) || submissionEmail(data) || "A customer";
  const amount = sub.payment_amount_cents
    ? (sub.payment_amount_cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" })
    : "A payment";
  const origin = process.env.NEXT_PUBLIC_MODULES_EMBED_ORIGIN ?? EMBED_ORIGIN;
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: "VisionWorkx <notifications@notify.revalorllc.com>",
      to: [ws.notification_email],
      subject: `Payment received: ${amount} from ${String(who).slice(0, 80)}`,
      text:
        `${who} paid ${amount}${mod?.name ? ` through your ${mod.name} form` : ""}.\n\n` +
        `See the submission: ${origin}/workspace/${ws.slug}\n\n` +
        `The money goes to your own Stripe account; payouts follow your Stripe schedule.\n\n— VisionWorkx`,
    }),
  }).catch(() => null);
  if (res && !res.ok) console.error("[modules/connect] payment email failed:", res.status);
}
