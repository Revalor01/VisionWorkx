import { expect, qa, test } from "../../lib/qa";
import { mockTessa, sanctumLogin } from "../../lib/sanctum";

// Sanctum web app: crisis safety. These must never regress.

qa(
  { id: "sanctum/safety/journal-crisis-banner", area: "Safety", title: "Crisis language in the journal shows the support banner", smoke: true },
  async ({ page, sanctumUser }) => {
    const user = await sanctumUser();
    await sanctumLogin(page, user);
    await page.goto("/toolkit/journal");
    // A phrase from lib/crisisDetection.ts in sanctum-web.
    await page.getByPlaceholder("What's on your mind?").fill("QA safety check: I can't go on like this.");
    await page.getByRole("button", { name: "Save entry" }).click();
    await expect(page.getByText("You're not alone.")).toBeVisible();
    const support = page.getByRole("link", { name: "See support options" });
    await expect(support).toHaveAttribute("href", "/toolkit/crisis-pathway");
    await page.getByRole("button", { name: "Dismiss" }).click();
    await expect(page.getByText("You're not alone.")).toBeHidden();
  },
);

// Ported from sanctum-web e2e/tests/crisis-banner.spec.ts (Tessa's reply is simulated).
qa(
  { id: "sanctum/safety/tessa-crisis-banner", area: "Safety", title: "Tessa's crisis flag shows the banner with a 988 link", smoke: true },
  async ({ page, sanctumUser }) => {
    const user = await sanctumUser({ tier: "test" });
    await sanctumLogin(page, user);
    await mockTessa(page, { reply: "I hear you. Real support is available right now.", crisis: true });
    await page.goto("/ai");
    await page.getByPlaceholder(/type a message/i).fill("QA test message");
    await page.getByRole("button", { name: /^send$/i }).click();
    await expect(page.getByText(/you're not alone/i)).toBeVisible();
    const crisisLink = page.getByRole("link", { name: /call or text 988/i });
    await expect(crisisLink).toHaveAttribute("href", "tel:988");
    await page.getByRole("button", { name: /dismiss/i }).click();
    await expect(page.getByText(/you're not alone/i)).toBeHidden();
  },
);

qa({ id: "sanctum/safety/crisis-resources", area: "Safety", title: "Crisis pathway and resources show working 988 / 741741 links" }, async ({ page, sanctumUser }) => {
  const user = await sanctumUser();
  await sanctumLogin(page, user);
  await test.step("crisis pathway", async () => {
    await page.goto("/toolkit/crisis-pathway");
    await expect(page.getByRole("heading", { name: "Crisis Pathway" })).toBeVisible();
    await expect(page.getByText("988").first()).toBeVisible();
  });
  await test.step("crisis resources", async () => {
    await page.goto("/account/crisis-resources");
    await expect(page.getByRole("heading", { name: "Crisis Resources" })).toBeVisible();
    await expect(page.locator('a[href="tel:988"]').first()).toBeVisible();
    await expect(page.locator('a[href="sms:741741&body=HOME"]')).toBeVisible();
    await expect(page.locator('a[href="tel:911"]')).toBeVisible();
  });
});
