import type Stripe from "stripe";
import { expect, qa, test } from "../../lib/qa";
import { createModule, formConfig, modulesAdmin, NAME_FIELD, signIn, submitViaApi, waitFor } from "../../lib/modules";
import { deleteTestCustomer, priceFor, stripeTest, stripeTestReady } from "../../lib/stripe";

// Plans & billing against the Stripe SANDBOX. These only run against a
// preview deployment (whose Vercel env has sandbox keys and sandbox price
// IDs); the workflow forwards sandbox webhooks to that preview with
// `stripe listen`. On production they skip -- no live money, ever.
//
// Workspaces here start with no plan (billing sync deliberately ignores
// "comped" workspaces). Every Stripe customer made here is deleted afterwards.

test.use({ workspaceOptions: { billingStatus: "none" } });

const WEBHOOK_WAIT = 60_000; // Stripe → stripe listen → preview → database

test.beforeEach(() => {
  const ready = stripeTestReady();
  test.skip(!ready.ok, ready.ok ? "" : ready.reason);
});

async function workspaceBilling(id: string) {
  const { data, error } = await modulesAdmin().from("vw_workspaces").select("plan, billing_status, stripe_customer_id, trial_ends_at").eq("id", id).single();
  if (error || !data) throw new Error(`workspace ${id} not found: ${error?.message}`);
  return data as { plan: string; billing_status: string; stripe_customer_id: string | null; trial_ends_at: string | null };
}

/** A sandbox customer + subscription for the workspace, made through the API (the webhook syncs it). */
async function subscribeViaApi(workspaceId: string, plan: "starter" | "growth" | "pro", opts: { trial: boolean }): Promise<Stripe.Subscription> {
  const s = stripeTest();
  const customer = await s.customers.create({ name: "QA workspace", email: "qa-billing@example.com", metadata: { vw_workspace_id: workspaceId, qa: "true" } });
  await modulesAdmin().from("vw_workspaces").update({ stripe_customer_id: customer.id }).eq("id", workspaceId);
  const pm = await s.paymentMethods.attach("pm_card_visa", { customer: customer.id });
  await s.customers.update(customer.id, { invoice_settings: { default_payment_method: pm.id } });
  return s.subscriptions.create({
    customer: customer.id,
    items: [{ price: await priceFor(plan) }],
    metadata: { vw_workspace_id: workspaceId },
    ...(opts.trial ? { trial_period_days: 14 } : {}),
  });
}

qa(
  { id: "visionworkx/billing/start-trial-checkout", area: "Plans & billing", title: "Owner starts the 14-day trial through Stripe checkout", requires: ["stripe-test"] },
  async ({ page, context, qaWorkspace }) => {
    test.setTimeout(3 * 60_000);
    let customerId: string | null = null;
    try {
      await signIn(context, qaWorkspace.owner);
      await page.goto(`/workspace/${qaWorkspace.slug}/billing`);

      await test.step("pick Starter, monthly", async () => {
        await expect(page.getByText("Start with a 14-day free trial.")).toBeVisible();
        await page.getByRole("button", { name: "Monthly", exact: true }).click();
        await page.getByRole("button", { name: "Start 14-day free trial" }).first().click();
        await page.waitForURL(/checkout\.stripe\.com/, { timeout: 30_000 });
      });

      await test.step("pay on Stripe's checkout page (test card 4242)", async () => {
        // Checkout lists several payment methods; pick Card.
        const card = page.getByRole("radio", { name: "Card", exact: true });
        await expect(card).toBeVisible({ timeout: 20_000 });
        await card.check();
        // Stripe Link's "save my information" is on by default and wants a phone number: switch it off.
        const saveInfo = page.getByRole("checkbox", { name: /Save my information/ });
        if (await saveInfo.isChecked({ timeout: 3_000 }).catch(() => false)) await saveInfo.uncheck();
        await page.locator("#cardNumber").fill("4242 4242 4242 4242");
        await page.locator("#cardExpiry").fill("12 / 34");
        await page.locator("#cardCvc").fill("123");
        await page.locator("#billingName").fill("QA Tester");
        const zip = page.locator("#billingPostalCode");
        if (await zip.isVisible().catch(() => false)) await zip.fill("10001");
        await page.locator('[data-testid="hosted-payment-submit-button"]').click();
        await page.waitForURL(new RegExp(`/workspace/${qaWorkspace.slug}/`), { timeout: 60_000 });
      });

      await test.step("the webhook puts the workspace on the Starter trial", async () => {
        const ws = await waitFor(async () => {
          const w = await workspaceBilling(qaWorkspace.id);
          customerId = w.stripe_customer_id;
          return w.billing_status === "trialing" ? w : null;
        }, "billing_status = trialing", WEBHOOK_WAIT);
        expect(ws.plan).toBe("starter");
        const days = Math.round((new Date(ws.trial_ends_at!).getTime() - Date.now()) / 864e5);
        expect(days).toBeGreaterThanOrEqual(13);
        expect(days).toBeLessThanOrEqual(14);
      });

      await test.step("Billing shows the trial", async () => {
        await page.goto(`/workspace/${qaWorkspace.slug}/billing`);
        await expect(page.getByText(/Free trial — 1[34] days left/)).toBeVisible();
      });
    } finally {
      await deleteTestCustomer(customerId ?? (await workspaceBilling(qaWorkspace.id).catch(() => null))?.stripe_customer_id);
    }
  },
);

qa(
  { id: "visionworkx/billing/plan-change-syncs", area: "Plans & billing", title: "A plan change in Stripe updates the workspace's plan", requires: ["stripe-test"] },
  async ({ qaWorkspace }) => {
    test.setTimeout(3 * 60_000);
    const sub = await subscribeViaApi(qaWorkspace.id, "starter", { trial: true });
    try {
      await waitFor(async () => {
        const w = await workspaceBilling(qaWorkspace.id);
        return w.billing_status === "trialing" && w.plan === "starter" ? w : null;
      }, "the Starter trial to sync", WEBHOOK_WAIT);

      await stripeTest().subscriptions.update(sub.id, {
        items: [{ id: sub.items.data[0].id, price: await priceFor("growth") }],
        proration_behavior: "none",
      });
      await waitFor(async () => ((await workspaceBilling(qaWorkspace.id)).plan === "growth" ? true : null), "plan = growth", WEBHOOK_WAIT);
    } finally {
      await deleteTestCustomer(typeof sub.customer === "string" ? sub.customer : sub.customer.id);
    }
  },
);

qa(
  { id: "visionworkx/billing/cancel-pauses-forms", area: "Plans & billing", title: "Cancelling the subscription pauses the workspace's live forms", requires: ["stripe-test"] },
  async ({ request, qaWorkspace }) => {
    test.setTimeout(3 * 60_000);
    const sub = await subscribeViaApi(qaWorkspace.id, "starter", { trial: false });
    try {
      await waitFor(async () => ((await workspaceBilling(qaWorkspace.id)).billing_status === "active" ? true : null), "billing_status = active", WEBHOOK_WAIT);
      const mod = await createModule(qaWorkspace.id, "lead_capture", formConfig([NAME_FIELD]));

      await test.step("while paid, the form accepts submissions", async () => {
        const r = await submitViaApi(request, mod.publicId, { data: { name: "QA Before Cancel" } });
        expect(r.status, JSON.stringify(r.json)).toBe(200);
      });

      await test.step("after cancelling, it doesn't", async () => {
        await stripeTest().subscriptions.cancel(sub.id);
        await waitFor(async () => ((await workspaceBilling(qaWorkspace.id)).billing_status === "canceled" ? true : null), "billing_status = canceled", WEBHOOK_WAIT);
        await waitFor(async () => ((await submitViaApi(request, mod.publicId, { data: { name: "QA After Cancel" } })).status === 404 ? true : null), "the form to stop accepting submissions", 30_000);
      });
    } finally {
      await deleteTestCustomer(typeof sub.customer === "string" ? sub.customer : sub.customer.id);
    }
  },
);
