import { expect, qa, test } from "../../lib/qa";
import { elevateLogin, mockClarity } from "../../lib/elevate";

// Elevate web app: what each plan can open. Clarity (the AI) is Premium;
// export is Plus.

qa({ id: "elevate/tiers/clarity-upsell", area: "Plans", title: "Free and Plus see the Premium upsell instead of Clarity", smoke: true }, async ({ page, elevateUser }) => {
  for (const tier of ["free", "plus"] as const) {
    await test.step(tier, async () => {
      await page.context().clearCookies();
      await elevateLogin(page, await elevateUser({ tier }));
      await page.goto("/clarity");
      await expect(page.getByRole("heading", { name: "Clarity is a Premium feature" })).toBeVisible();
      await expect(page.getByPlaceholder("Type a message…")).toHaveCount(0);
    });
  }
});

qa({ id: "elevate/tiers/premium-chats-with-clarity", area: "Plans", title: "Premium can chat with Clarity (simulated reply)", mobile: true }, async ({ page, elevateUser }) => {
  await elevateLogin(page, await elevateUser({ tier: "premium" }));
  await mockClarity(page, "Here's one way to look at what happened — QA reply.");
  await page.goto("/clarity");
  await page.getByPlaceholder("Type a message…").fill("Help me think about a hard conversation — automated test.");
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await expect(page.getByText("Here's one way to look at what happened — QA reply.")).toBeVisible();
});

qa({ id: "elevate/tiers/export-is-plus", area: "Plans", title: "Export is offered to Plus and gated for Free" }, async ({ page, elevateUser }) => {
  await test.step("free", async () => {
    await elevateLogin(page, await elevateUser({ tier: "free" }));
    await page.goto("/account/privacy");
    await expect(page.getByText(/Exporting your retros \(JSON and PDF\) is part of Plus/)).toBeVisible();
    await expect(page.getByText("Download everything (JSON)")).toHaveCount(0);
  });
  await test.step("plus", async () => {
    await page.context().clearCookies();
    await elevateLogin(page, await elevateUser({ tier: "plus" }));
    await page.goto("/account/privacy");
    await expect(page.getByText("Download everything (JSON)")).toBeVisible();
    await expect(page.getByText("Your retros as a PDF")).toBeVisible();
  });
});
