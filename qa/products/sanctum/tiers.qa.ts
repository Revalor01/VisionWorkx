import { expect, qa, test } from "../../lib/qa";
import { mockTessa, sanctumLogin } from "../../lib/sanctum";

// Sanctum web app: what each plan can and can't open.

const PLUS_ROUTES = [
  { path: "/toolkit/guided-reflections", heading: /Guided Reflections/i },
  { path: "/toolkit/weekly-report", heading: /Weekly Emotional Report/i },
  { path: "/toolkit/strength-sessions", heading: /Strength Sessions/i },
  { path: "/toolkit/capacity-check", heading: /Capacity Check/i },
];

// Ported from sanctum-web e2e/tests/plus-gating.spec.ts.
qa({ id: "sanctum/tiers/free-sees-plus-gates", area: "Plans", title: "Free sees the Plus gate on all four Plus features" }, async ({ page, sanctumUser }) => {
  await sanctumLogin(page, await sanctumUser({ tier: "free" }));
  for (const route of PLUS_ROUTES) {
    await test.step(route.path, async () => {
      await page.goto(route.path);
      await expect(page.getByRole("heading", { name: route.heading })).toBeVisible();
      await expect(page.getByText("Plus feature")).toBeVisible();
      await expect(page.getByRole("link", { name: /Upgrade to Plus/i })).toBeVisible();
    });
  }
});

qa({ id: "sanctum/tiers/free-insights-7-days", area: "Plans", title: "Free Insights is capped to 7 days with an upgrade prompt" }, async ({ page, sanctumUser }) => {
  await sanctumLogin(page, await sanctumUser({ tier: "free" }));
  await page.goto("/toolkit/insights-progress");
  await expect(page.getByText(/last 7 days/i)).toBeVisible();
  await expect(page.getByText(/Plus unlocks 90-day history/i)).toBeVisible();
});

qa({ id: "sanctum/tiers/plus-opens-plus-features", area: "Plans", title: "Plus opens all four Plus features" }, async ({ page, sanctumUser }) => {
  await sanctumLogin(page, await sanctumUser({ tier: "plus" }));
  for (const route of PLUS_ROUTES) {
    await test.step(route.path, async () => {
      await page.goto(route.path);
      await expect(page.getByRole("heading", { name: route.heading })).toBeVisible();
      await expect(page.getByText("Plus feature")).toBeHidden();
    });
  }
});

qa({ id: "sanctum/tiers/free-sees-tessa-upsell", area: "Plans", title: "Free and Plus see the Premium upsell instead of Tessa" }, async ({ page, sanctumUser }) => {
  for (const tier of ["free", "plus"] as const) {
    await test.step(tier, async () => {
      await page.context().clearCookies();
      await sanctumLogin(page, await sanctumUser({ tier }));
      await page.goto("/ai");
      await expect(page.getByRole("heading", { name: "Tessa is a Premium feature" })).toBeVisible();
      await expect(page.getByPlaceholder(/type a message/i)).toHaveCount(0);
    });
  }
});

qa({ id: "sanctum/tiers/premium-chats-with-tessa", area: "Plans", title: "Premium can chat with Tessa (simulated reply)", mobile: true }, async ({ page, sanctumUser }) => {
  await sanctumLogin(page, await sanctumUser({ tier: "premium" }));
  await mockTessa(page, { reply: "Hello from the QA suite — thanks for sharing." });
  await page.goto("/ai");
  await page.getByPlaceholder(/type a message/i).fill("Hi Tessa, this is an automated test.");
  await page.getByRole("button", { name: /^send$/i }).click();
  await expect(page.getByText("Hello from the QA suite — thanks for sharing.")).toBeVisible();
  await expect(page.getByText(/you're not alone/i), "no crisis banner for an ordinary reply").toBeHidden();
});
