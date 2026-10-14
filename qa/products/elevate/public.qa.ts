import { expect, qa, test } from "../../lib/qa";

// Elevate web app: pages anyone can reach, and what signed-out visitors can't.

qa({ id: "elevate/public/pages-load", area: "Public", title: "Welcome, pricing, login, privacy and terms load", smoke: true }, async ({ page }) => {
  const pages = [
    { path: "/auth/welcome", heading: "Elevate" },
    { path: "/auth/pricing", heading: "Choose your plan" },
    { path: "/auth/login", heading: "Welcome back" },
    { path: "/privacy", heading: "Privacy Policy" },
    { path: "/terms", heading: "Terms of Service" },
  ];
  for (const p of pages) {
    await test.step(p.path, async () => {
      await page.goto(p.path);
      await expect(page.getByRole("heading", { name: p.heading, exact: true })).toBeAttached();
    });
  }
});

qa({ id: "elevate/public/signed-out-redirected", area: "Public", title: "Signed-out visitors can't reach app screens or account settings", smoke: true }, async ({ page }) => {
  for (const path of ["/home", "/retro", "/playbook", "/clarity", "/account/manage-plan"]) {
    await test.step(path, async () => {
      await page.goto(path);
      await page.waitForURL(/\/auth\/welcome/, { timeout: 10_000 });
    });
  }
});
