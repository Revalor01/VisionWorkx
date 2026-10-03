import { expect, qa, test } from "../../lib/qa";

// Revalor Products site: the homepage's AI quiz promo and the free guides.
// Read-only: nothing is submitted.

qa(
  { id: "revalor-products/homepage/quiz-promo", area: "Homepage", title: "Homepage features the free AI quiz", smoke: true, mobile: true },
  async ({ page, request }) => {
    await page.goto("/");
    await test.step("banner, hero button and menu link point at the quiz", async () => {
      await expect(page.getByRole("heading", { name: "What’s your AI level?" })).toBeVisible();
      await expect(page.locator('a[href="/ai-quiz?src=home-hero"]')).toHaveCount(1);
      await expect(page.locator('a[href="/ai-quiz?src=home-banner"]')).toHaveCount(1);
      await expect(page.locator('a[href="/ai-quiz?src=nav"]')).toHaveCount(1);
    });
    await test.step("both guide covers load", async () => {
      for (const img of ["ai-basics-cover.jpg", "ai-next-level-cover.jpg"]) {
        const res = await request.get(`/assets/guides/${img}`);
        expect(res.status(), img).toBe(200);
      }
    });
    await test.step("banner button opens the quiz", async () => {
      await page.locator('a[href="/ai-quiz?src=home-banner"]').click();
      await page.waitForURL(/\/ai-quiz\?src=home-banner$/);
      await expect(page.getByRole("button", { name: /Start the free quiz/i })).toBeVisible();
    });
  },
);

qa(
  { id: "revalor-products/guides/pdfs-download", area: "Guides", title: "Both free guide PDFs download", smoke: true },
  async ({ request }) => {
    for (const pdf of ["ai-basics.pdf", "ai-next-level.pdf"]) {
      await test.step(pdf, async () => {
        const res = await request.get(`/guides/${pdf}`);
        expect(res.status()).toBe(200);
        expect(res.headers()["content-type"]).toContain("application/pdf");
        expect((await res.body()).length, "not an empty file").toBeGreaterThan(100_000);
      });
    }
  },
);
