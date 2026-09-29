import { expect, qa } from "../../lib/qa";
import { proactiveLogin, proactiveRows } from "../../lib/proactive";

// Proactive web app: payments can't be skipped, account settings save, admin is refused.

// Ported from proactive e2e/tests/payment-security.spec.ts.
qa(
  { id: "proactive/payments/success-page-no-self-upgrade", area: "Payments", title: "Visiting /payment/success directly doesn't grant Premium", smoke: true },
  async ({ page, proactiveUser }) => {
    const user = await proactiveUser({ tier: "free" });
    await proactiveLogin(page, user);
    await page.goto("/payment/success?plan=premium");
    await expect(page.getByText(/almost there/i)).toBeVisible();
    await expect(page.getByText(/welcome to.*premium/i)).toBeHidden();
    await page.goto("/account/manage-plan");
    await expect(page.getByText("Current plan")).toBeVisible();
    await expect(page.getByText("Free", { exact: true })).toBeVisible();
    const [profile] = await proactiveRows<{ subscription_tier: string }>("users_profile", `id=eq.${user.id}&select=subscription_tier`);
    expect(profile.subscription_tier).toBe("free");
  },
);

qa({ id: "proactive/payments/invalid-test-code-rejected", area: "Payments", title: "An invalid test-access code is rejected" }, async ({ page, proactiveUser }) => {
  const user = await proactiveUser({ tier: "free" });
  await proactiveLogin(page, user);
  await page.goto("/account/redeem-test-code");
  await page.getByPlaceholder("Enter test code").fill(`QA-NOT-A-CODE-${Date.now().toString(36)}`);
  await page.getByRole("button", { name: "Redeem" }).click();
  await expect(page.getByText("That code isn't valid.")).toBeVisible();
  const [profile] = await proactiveRows<{ subscription_tier: string }>("users_profile", `id=eq.${user.id}&select=subscription_tier`);
  expect(profile.subscription_tier).toBe("free");
});

qa({ id: "proactive/account/edit-profile", area: "Account", title: "Display name saves" }, async ({ page, proactiveUser }) => {
  const user = await proactiveUser();
  await proactiveLogin(page, user);
  // The page fills the form from users_profile after it renders; anything typed before that
  // read finishes is overwritten (display name reset to ""), so wait for the read first.
  const profileLoaded = page.waitForResponse((r) => r.url().includes("/rest/v1/users_profile") && r.request().method() === "GET");
  await page.goto("/account/edit-profile");
  await profileLoaded;
  const displayName = `QA ${Date.now().toString(36)}`;
  await page.locator("label", { hasText: "Display name" }).locator("xpath=following-sibling::input[1]").fill(displayName);
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByRole("button", { name: /Saved/ })).toBeVisible();
  const [profile] = await proactiveRows<{ display_name: string }>("users_profile", `id=eq.${user.id}&select=display_name`);
  expect(profile.display_name).toBe(displayName);
});

qa({ id: "proactive/admin/non-admin-refused", area: "Admin", title: "Non-admin accounts can't open the admin page", smoke: true }, async ({ page, proactiveUser }) => {
  await proactiveLogin(page, await proactiveUser({ tier: "premium" }));
  await page.goto("/admin");
  await page.waitForURL(/\/home/);
  await expect(page.getByRole("heading", { name: "Welcome back." })).toBeVisible();
});
