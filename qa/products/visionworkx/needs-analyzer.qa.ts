import { expect, qa, test } from "../../lib/qa";

// Needs Analyzer (/admin/needs-analyzer, /proposal/<token>, the laptop sync route).
// Black-box for now: the QA runner has no main-project database key or operator
// session, so these check that everything private stays private. A full
// create -> share -> open -> revoke test needs one of those added to the runner.

const RANDOM_TOKEN = "qaQAqaQAqaQAqaQAqaQAqaQAqaQAqa00"; // right shape, never issued

qa(
  { id: "visionworkx/needs-analyzer/admin-requires-operator", area: "Needs Analyzer", title: "Admin screens and API need the operator", smoke: true },
  async ({ page, request }) => {
    await test.step("signed-out visit is sent away from the analyzer", async () => {
      await page.goto("/admin/needs-analyzer");
      await expect(page).not.toHaveURL(/needs-analyzer/);
    });
    await test.step("API refuses without the operator session", async () => {
      expect((await request.get("/api/admin/needs-analyzer/assessments")).status()).toBe(403);
      expect((await request.post("/api/admin/needs-analyzer/assessments")).status()).toBe(403);
      expect((await request.put("/api/admin/needs-analyzer/settings/catalog", { data: {} })).status()).toBe(403);
    });
    await test.step("website builder tab is operator-gated too", async () => {
      const id = "00000000-0000-4000-8000-000000000000";
      await page.goto(`/admin/needs-analyzer/${id}?tab=builder`);
      await expect(page).not.toHaveURL(/needs-analyzer/);
    });
    await test.step("website check screen and API refuse without the operator session", async () => {
      await page.goto("/admin/needs-analyzer/website");
      await expect(page).not.toHaveURL(/needs-analyzer/);
      expect((await request.post("/api/admin/needs-analyzer/site-check", { data: { url: "example.com" } })).status()).toBe(403);
      const id = "00000000-0000-4000-8000-000000000000";
      expect((await request.patch(`/api/admin/needs-analyzer/site-check/${id}`, { data: { proposalIssues: [] } })).status()).toBe(403);
      expect((await request.post(`/api/admin/needs-analyzer/site-check/${id}/ai`)).status()).toBe(403);
    });
  },
);

qa({ id: "visionworkx/needs-analyzer/sync-requires-secret", area: "Needs Analyzer", title: "Laptop sync needs the sync secret" }, async ({ request }) => {
  expect((await request.post("/api/needs-analyzer/sync", { data: { assessments: [] } })).status()).toBe(401);
  const wrong = await request.post("/api/needs-analyzer/sync", { data: { assessments: [] }, headers: { authorization: "Bearer not-the-secret" } });
  expect(wrong.status()).toBe(401);
});

qa({ id: "visionworkx/needs-analyzer/unknown-proposal-link", area: "Needs Analyzer", title: "An unknown or malformed proposal link is a 404" }, async ({ page }) => {
  expect((await page.goto(`/proposal/${RANDOM_TOKEN}`))?.status()).toBe(404);
  expect((await page.goto("/proposal/not-a-token"))?.status()).toBe(404);
});
