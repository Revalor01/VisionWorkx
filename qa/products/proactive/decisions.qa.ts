import { expect, qa, test } from "../../lib/qa";
import { proactiveLogin } from "../../lib/proactive";

// Proactive web app: the decision tools. They run in the browser and are free;
// only handing a result to Collaborator (the AI) needs Premium.

qa(
  { id: "proactive/decisions/prioritization", area: "Decision tools", title: "Prioritization turns a ranking into a read, and hands off to Collaborator", smoke: true },
  async ({ page, proactiveUser }) => {
    await proactiveLogin(page, await proactiveUser({ tier: "free" }));
    await page.goto("/ai/prioritize");
    await expect(page.getByRole("heading", { name: "Prioritization" })).toBeVisible();

    await test.step("rank every lever", async () => {
      await page.getByPlaceholder(/e\.g\. the Q3 launch/).fill("the QA test launch");
      await page.getByRole("button", { name: "Start ranking" }).click();
      const levers = page.getByRole("button", { name: /Protect =/ });
      await expect(levers.first()).toBeVisible();
      const count = await levers.count();
      for (let i = 0; i < count; i++) await levers.first().click();
      await expect(levers).toHaveCount(0);
      await page.getByRole("button", { name: "See the read" }).click();
    });

    await test.step("the read", async () => {
      await expect(page.getByText("Your anchor")).toBeVisible();
      await expect(page.getByText("What gives")).toBeVisible();
      await expect(page.getByText("Say it out loud")).toBeVisible();
    });

    await test.step("hand-off to Collaborator (Premium upsell for Free)", async () => {
      await page.getByRole("button", { name: /Personalize with Collaborator/ }).click();
      await page.waitForURL(/\/ai\?seed=/);
      await expect(page.getByRole("heading", { name: "Collaborator is a Premium feature" })).toBeVisible();
    });
  },
);

qa({ id: "proactive/decisions/tools-open-for-free", area: "Decision tools", title: "Trade-Off Simulator and Practice a Decision open for Free" }, async ({ page, proactiveUser }) => {
  await proactiveLogin(page, await proactiveUser({ tier: "free" }));
  for (const t of [
    { path: "/ai/trade-off-simulator", heading: "Trade-Off Simulator" },
    { path: "/ai/decision-scenario", heading: "Practice a Decision" },
  ]) {
    await test.step(t.path, async () => {
      await page.goto(t.path);
      await expect(page.getByRole("heading", { name: t.heading })).toBeVisible();
      await expect(page.getByText(/Premium feature|Entry feature/)).toBeHidden();
    });
  }
});
