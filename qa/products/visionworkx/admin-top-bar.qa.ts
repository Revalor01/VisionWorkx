import { expect, qa, test } from "../../lib/qa";

// The shared Revalor admin top bar (app/admin/layout.tsx) carries Revalor's
// internal page map, so it's drawn only for the owner. Black-box: the QA runner
// has no operator session, so this checks it never reaches a signed-out visitor.

qa(
  { id: "visionworkx/admin/top-bar-owner-only", area: "Admin", title: "Revalor top bar is never shown to signed-out visitors", smoke: true },
  async ({ page, request }) => {
    for (const path of ["/admin", "/admin/needs-analyzer", "/admin/qa", "/admin/social", "/admin/marketing"]) {
      await test.step(`${path}: no top bar in the response or the page`, async () => {
        const res = await request.get(path, { maxRedirects: 0 });
        expect(await res.text()).not.toContain("revalor-top-bar");
        await page.goto(path);
        await expect(page.locator(".revalor-top-bar")).toHaveCount(0);
      });
    }
  },
);
