import { expect, qa } from "../../lib/qa";
import { sanctumLogin, sanctumRows } from "../../lib/sanctum";

// Sanctum web app: nobody gets a paid plan without paying.

// Ported from sanctum-web e2e/tests/payment-security.spec.ts.
qa(
  { id: "sanctum/payments/success-page-no-self-upgrade", area: "Payments", title: "Visiting /payment/success directly doesn't grant Premium", smoke: true },
  async ({ page, sanctumUser }) => {
    const user = await sanctumUser({ tier: "free" });
    await sanctumLogin(page, user);
    await page.goto("/payment/success?plan=premium");
    await expect(page.getByText(/almost there/i)).toBeVisible();
    await expect(page.getByText(/welcome to.*premium/i)).toBeHidden();
    await page.goto("/account/manage-plan");
    await expect(page.getByText("Current plan")).toBeVisible();
    await expect(page.getByText("Free", { exact: true })).toBeVisible();
    const [profile] = await sanctumRows<{ subscription_tier: string }>("users_profile", `id=eq.${user.id}&select=subscription_tier`);
    expect(profile.subscription_tier).toBe("free");
  },
);

qa({ id: "sanctum/payments/invalid-test-code-rejected", area: "Payments", title: "An invalid test-access code is rejected" }, async ({ page, sanctumUser }) => {
  const user = await sanctumUser({ tier: "free" });
  await sanctumLogin(page, user);
  await page.goto("/account/redeem-test-code");
  await page.getByPlaceholder("Enter test code").fill(`QA-NOT-A-CODE-${Date.now().toString(36)}`);
  await page.getByRole("button", { name: "Redeem" }).click();
  await expect(page.getByText("That code isn't valid.")).toBeVisible();
  const [profile] = await sanctumRows<{ subscription_tier: string }>("users_profile", `id=eq.${user.id}&select=subscription_tier`);
  expect(profile.subscription_tier).toBe("free");
});
