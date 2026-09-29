import { expect, qa, test } from "../../lib/qa";
import { mockCollaborator, proactiveLogin } from "../../lib/proactive";

// Proactive web app: what each plan can open. "Entry" is Proactive's name for
// the plus tier; Collaborator (the AI) is Premium.

const ENTRY_ROUTES = [
  // Locked screen: "Guided Decision Reflections"; unlocked page: "Decision Reflections".
  { path: "/toolkit/decision-reflections", heading: /Decision Reflections/i },
  { path: "/toolkit/clarity-report", heading: /Weekly Clarity Report/i },
  { path: "/toolkit/focus-session", heading: /Focus Sessions/i },
  { path: "/toolkit/resources/evaluation", heading: /Resource Evaluation/i },
  { path: "/toolkit/resources/motivation", heading: /Resource Motivation/i },
];

// Ported from proactive e2e/tests/entry-gating.spec.ts.
qa({ id: "proactive/tiers/free-sees-entry-gates", area: "Plans", title: "Free sees the Entry gate on all five Entry features" }, async ({ page, proactiveUser }) => {
  await proactiveLogin(page, await proactiveUser({ tier: "free" }));
  for (const route of ENTRY_ROUTES) {
    await test.step(route.path, async () => {
      await page.goto(route.path);
      await expect(page.getByRole("heading", { name: route.heading })).toBeVisible();
      await expect(page.getByText("Entry feature")).toBeVisible();
      await expect(page.getByRole("link", { name: /Upgrade to Entry/i })).toBeVisible();
    });
  }
});

qa({ id: "proactive/tiers/free-insights-7-days", area: "Plans", title: "Free Insights is capped to 7 days with an upgrade prompt" }, async ({ page, proactiveUser }) => {
  await proactiveLogin(page, await proactiveUser({ tier: "free" }));
  await page.goto("/toolkit/insights-progress");
  await expect(page.getByText(/last 7 days/i)).toBeVisible();
  await expect(page.getByText(/Entry unlocks 90-day history/i)).toBeVisible();
});

qa({ id: "proactive/tiers/entry-opens-entry-features", area: "Plans", title: "Entry opens all five Entry features" }, async ({ page, proactiveUser }) => {
  await proactiveLogin(page, await proactiveUser({ tier: "plus" }));
  for (const route of ENTRY_ROUTES) {
    await test.step(route.path, async () => {
      await page.goto(route.path);
      await expect(page.getByRole("heading", { name: route.heading })).toBeVisible();
      await expect(page.getByText("Entry feature")).toBeHidden();
    });
  }
});

qa({ id: "proactive/tiers/collaborator-upsell", area: "Plans", title: "Free and Entry see the Premium upsell instead of Collaborator" }, async ({ page, proactiveUser }) => {
  for (const tier of ["free", "plus"] as const) {
    await test.step(tier, async () => {
      await page.context().clearCookies();
      await proactiveLogin(page, await proactiveUser({ tier }));
      await page.goto("/ai");
      await expect(page.getByRole("heading", { name: "Collaborator is a Premium feature" })).toBeVisible();
      await expect(page.getByPlaceholder(/type a message/i)).toHaveCount(0);
    });
  }
});

qa({ id: "proactive/tiers/premium-chats-with-collaborator", area: "Plans", title: "Premium can chat with Collaborator (simulated reply)", mobile: true }, async ({ page, proactiveUser }) => {
  await proactiveLogin(page, await proactiveUser({ tier: "premium" }));
  await mockCollaborator(page, "Here's how I'd weigh those two options — QA reply.");
  await page.goto("/ai");
  await page.getByPlaceholder(/type a message/i).fill("Help me decide between two options — automated test.");
  await page.getByRole("button", { name: /^send$/i }).click();
  await expect(page.getByText("Here's how I'd weigh those two options — QA reply.")).toBeVisible();
});
