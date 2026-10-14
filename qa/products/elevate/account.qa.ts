import { expect, qa } from "../../lib/qa";
import { elevateLogin, elevateRows } from "../../lib/elevate";

// Elevate web app: payments can't be skipped, account settings save, admin is refused.

qa({ id: "elevate/payments/success-page-no-self-upgrade", area: "Payments", title: "Visiting /payment/success directly doesn't grant Premium", smoke: true }, async ({ page, elevateUser }) => {
  const user = await elevateUser({ tier: "free" });
  await elevateLogin(page, user);
  await page.goto("/payment/success?plan=premium");
  await expect(page.getByRole("heading", { name: "Almost there" })).toBeVisible({ timeout: 20_000 });
  await page.goto("/account/manage-plan");
  await expect(page.getByText("Current plan")).toBeVisible();
  await expect(page.getByText("Free", { exact: true })).toBeVisible();
  const [profile] = await elevateRows<{ subscription_tier: string }>("users_profile", `id=eq.${user.id}&select=subscription_tier`);
  expect(profile.subscription_tier).toBe("free");
});

qa({ id: "elevate/payments/invalid-test-code-rejected", area: "Payments", title: "An invalid test-access code is rejected" }, async ({ page, elevateUser }) => {
  const user = await elevateUser({ tier: "free" });
  await elevateLogin(page, user);
  await page.goto("/account/redeem-test-code");
  await page.getByPlaceholder("Enter test code").fill(`QA-NOT-A-CODE-${Date.now().toString(36)}`);
  await page.getByRole("button", { name: "Redeem" }).click();
  await expect(page.getByText("That code isn't valid.")).toBeVisible();
  const [profile] = await elevateRows<{ subscription_tier: string }>("users_profile", `id=eq.${user.id}&select=subscription_tier`);
  expect(profile.subscription_tier).toBe("free");
});

qa({ id: "elevate/account/edit-profile", area: "Account", title: "Display name saves" }, async ({ page, elevateUser }) => {
  const user = await elevateUser();
  await elevateLogin(page, user);
  // The form fills from users_profile after render; wait for that read so typing isn't overwritten.
  const profileLoaded = page.waitForResponse((r) => r.url().includes("/rest/v1/users_profile") && r.url().includes("display_name") && r.request().method() === "GET");
  await page.goto("/account/edit-profile");
  await profileLoaded;
  const displayName = `QA ${Date.now().toString(36)}`;
  await page.locator("label", { hasText: "Display name" }).locator("xpath=following-sibling::input[1]").fill(displayName);
  const write = page.waitForResponse((r) => r.url().includes("/rest/v1/users_profile") && r.request().method() === "PATCH", { timeout: 10_000 });
  await page.getByRole("button", { name: "Save", exact: true }).click();
  const res = await write.catch(() => null);
  expect(res, "Save sent no update to users_profile").not.toBeNull();
  expect(res!.status(), `update answered ${res!.status()}`).toBeLessThan(300);
  await expect(page.getByRole("button", { name: /Saved/ })).toBeVisible();
  const [profile] = await elevateRows<{ display_name: string }>("users_profile", `id=eq.${user.id}&select=display_name`);
  expect(profile.display_name).toBe(displayName);
});

qa({ id: "elevate/admin/non-admin-refused", area: "Admin", title: "Non-admin accounts can't open the admin page", smoke: true }, async ({ page, elevateUser }) => {
  await elevateLogin(page, await elevateUser({ tier: "premium" }));
  await page.goto("/admin");
  await page.waitForURL(/\/home/);
  await expect(page.getByRole("heading", { name: "Welcome back." })).toBeVisible();
});
