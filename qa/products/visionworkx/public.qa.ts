import { expect, qa, test } from "../../lib/qa";

// Public pages anyone can reach; no test data needed.

qa(
  { id: "visionworkx/public/pages-load", area: "Public site", title: "Home, signup and privacy pages load", smoke: true },
  async ({ page }) => {
    await test.step("home", async () => {
      const res = await page.goto("/");
      expect(res?.status(), "home status").toBeLessThan(400);
      await expect(page).toHaveTitle(/VisionWorkx/);
    });
    await test.step("signup (/start)", async () => {
      const res = await page.goto("/start");
      expect(res?.status(), "/start status").toBeLessThan(400);
      await expect(page.locator('input[type="email"]').first()).toBeVisible();
    });
    await test.step("privacy policy", async () => {
      const res = await page.goto("/privacy");
      expect(res?.status(), "/privacy status").toBeLessThan(400);
      // Google OAuth verification requires this section to stay published.
      await expect(page.getByRole("heading", { name: /Google Calendar/ })).toBeVisible();
    });
  },
);

qa({ id: "visionworkx/public/embed-script", area: "Public site", title: "Embed script is served", smoke: true }, async ({ request }) => {
  const res = await request.get("/embed.js");
  expect(res.status()).toBe(200);
  expect(res.headers()["content-type"] ?? "").toMatch(/javascript/);
  expect(await res.text()).toContain("VisionWorkx embed loader");
});
