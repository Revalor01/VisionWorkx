import { expect, qa, test } from "../../lib/qa";

// Sanctum web app: pages anyone can reach, and what signed-out visitors can't.

qa({ id: "sanctum/public/pages-load", area: "Public", title: "Welcome, pricing and login pages load", smoke: true }, async ({ page }) => {
  await test.step("welcome", async () => {
    await page.goto("/auth/welcome");
    await expect(page.getByRole("heading", { name: "Sanctum", exact: true })).toBeVisible();
  });
  await test.step("pricing", async () => {
    await page.goto("/auth/pricing");
    await expect(page.getByRole("heading", { name: "Choose Your Plan" })).toBeVisible();
  });
  await test.step("login", async () => {
    await page.goto("/auth/login");
    await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();
  });
});

// Ported from sanctum-web e2e/tests/auth-gating.spec.ts.
qa(
  { id: "sanctum/public/signed-out-redirected", area: "Public", title: "Signed-out visitors can't reach app screens or account settings", smoke: true },
  async ({ page }) => {
    for (const path of ["/home", "/account/manage-plan", "/checkin", "/ai"]) {
      await test.step(path, async () => {
        await page.goto(path);
        await page.waitForURL(/\/auth\/welcome/, { timeout: 10_000 });
      });
    }
  },
);
