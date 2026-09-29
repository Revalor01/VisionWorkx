import Stripe from "stripe";

// Stripe for billing tests: the VisionWorkx Stripe SANDBOX only. Refuses to
// run with anything but a test key, and billing tests only run against a
// preview deployment (whose env has sandbox keys) -- never production, so no
// live money is ever touched.
//
// Needs STRIPE_TEST_SECRET_KEY (GitHub secret). Prices are found by lookup key
// (vw_<plan>_<monthly|annual>), created in the sandbox for these tests.

export function stripeTestReady(): { ok: true } | { ok: false; reason: string } {
  if (process.env.QA_TARGET_ENV !== "preview") return { ok: false, reason: "billing tests only run against a preview deployment (Stripe sandbox)" };
  const key = process.env.STRIPE_TEST_SECRET_KEY ?? "";
  if (!key) return { ok: false, reason: "STRIPE_TEST_SECRET_KEY isn't set" };
  if (!/^(sk|rk)_test_/.test(key)) return { ok: false, reason: "STRIPE_TEST_SECRET_KEY is not a test-mode key" };
  return { ok: true };
}

let client: Stripe | null = null;
export function stripeTest(): Stripe {
  const ready = stripeTestReady();
  if (!ready.ok) throw new Error(ready.reason);
  client ??= new Stripe(process.env.STRIPE_TEST_SECRET_KEY!);
  return client;
}

export async function priceFor(plan: "starter" | "growth" | "pro", interval: "monthly" | "annual" = "monthly"): Promise<string> {
  const { data } = await stripeTest().prices.list({ lookup_keys: [`vw_${plan}_${interval}`], limit: 1 });
  if (!data[0]) throw new Error(`No sandbox price with lookup key vw_${plan}_${interval}`);
  return data[0].id;
}

/** Cancels every subscription of the customer and deletes it (sandbox only). */
export async function deleteTestCustomer(customerId: string | null | undefined): Promise<void> {
  if (!customerId) return;
  const s = stripeTest();
  try {
    const subs = await s.subscriptions.list({ customer: customerId, status: "all", limit: 20 });
    for (const sub of subs.data) if (sub.status !== "canceled") await s.subscriptions.cancel(sub.id);
    await s.customers.del(customerId);
  } catch (err) {
    console.warn(`[qa] Stripe cleanup of ${customerId} failed:`, err instanceof Error ? err.message : err);
  }
}
