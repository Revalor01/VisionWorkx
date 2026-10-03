import { expect, qa, test } from "../../lib/qa";
import { type Page } from "@playwright/test";
import { VALID_ANSWERS, deleteLead, getLead, productsDbConfigured, quizTestEmail } from "../../lib/revalorProducts";

// The AI quiz at /ai-quiz. Submissions use Resend test inboxes, so Email 1
// goes nowhere real and no call alert reaches info@revalorllc.com. The quiz
// API allows 5 submissions per IP per 10 minutes, so this file submits at most
// 3 times (bad-input test included).

async function answerToContactStep(page: Page, opts: { business: boolean; wantsCall?: boolean }) {
  await page.goto("/ai-quiz?src=qa");
  await page.getByRole("button", { name: /Start the free quiz/i }).click();
  await page.getByRole("button", { name: "Every day" }).click();
  await page.getByRole("button", { name: opts.business ? "My own small or local business" : "Personal life (emails, planning, learning)" }).click();
  await page.getByRole("button", { name: "The answers are vague, generic or not what I wanted" }).click();
  await page.getByRole("checkbox", { name: "Writing or rewriting emails and messages" }).check();
  await page.getByRole("button", { name: "Next →" }).click();
  await page.getByRole("button", { name: "A sentence or two with some detail" }).click();
  await page.getByRole("button", { name: "Yes, once or twice" }).click();
  await page.getByRole("button", { name: "Skip →" }).click();
  if (opts.business) {
    await expect(page.getByText("Would you like a free 15-minute call with Revalor?")).toBeVisible();
    if (opts.wantsCall) await page.getByRole("checkbox", { name: /free 15-minute call/ }).check();
    await page.getByRole("button", { name: "Next →" }).click();
  }
  await expect(page.getByRole("heading", { name: /Where should we send your two free guides/i })).toBeVisible();
}

async function submitContact(page: Page, email: string) {
  await page.getByLabel("First name").fill("QA Tester");
  await page.getByLabel("Email").fill(email);
  await page.getByRole("checkbox", { name: /Send me the guides/ }).check();
  await page.getByRole("button", { name: /Get my result and guides/ }).click();
}

qa(
  { id: "revalor-products/quiz/take-quiz", area: "AI quiz", title: "Take the quiz → result screen, lead saved, Email 1 sent", smoke: true },
  async ({ page }) => {
    test.skip(!productsDbConfigured(), "PRODUCTS_SUPABASE_* not set");
    const email = quizTestEmail("take");
    try {
      await test.step("answer as a personal user (no call question)", async () => {
        await answerToContactStep(page, { business: false });
      });
      await test.step("submit and see the result", async () => {
        await submitContact(page, email);
        await expect(page.getByText("AI Builder")).toBeVisible(); // 3 + 1 + 1 = 5
        await expect(page.getByText(/guides are on the way/)).toBeVisible();
      });
      await test.step("lead saved with the server's score and Email 1 sent", async () => {
        await expect
          .poll(async () => (await getLead(email))?.guides_sent_at ?? null, { timeout: 30_000, message: "Email 1 sent (guides_sent_at)" })
          .not.toBeNull();
        const lead = await getLead(email);
        expect(lead).toMatchObject({ score: 5, level: "builder", source: "qa", wants_call: false, is_business_owner: false, nurture_step: 1 });
        expect(lead?.next_email_at, "Email 2 scheduled").not.toBeNull();
      });
    } finally {
      if (productsDbConfigured()) await deleteLead(email);
    }
  },
);

qa(
  { id: "revalor-products/quiz/business-call-request", area: "AI quiz", title: "Business owner asks for a call (test address: no alert)", onDemand: true },
  async ({ page }) => {
    test.skip(!productsDbConfigured(), "PRODUCTS_SUPABASE_* not set");
    const email = quizTestEmail("call");
    try {
      await answerToContactStep(page, { business: true, wantsCall: true });
      await submitContact(page, email);
      await expect(page.getByText(/You ticked the box for a free 15-minute call/)).toBeVisible();
      await expect.poll(async () => (await getLead(email))?.guides_sent_at ?? null, { timeout: 30_000 }).not.toBeNull();
      const lead = await getLead(email);
      expect(lead).toMatchObject({ wants_call: true, is_business_owner: true });
      expect(lead?.call_alert_sent_at, "no call alert for a Resend test address").toBeNull();
    } finally {
      if (productsDbConfigured()) await deleteLead(email);
    }
  },
);

qa(
  { id: "revalor-products/quiz/phone-layout", area: "AI quiz", title: "Quiz works on a phone up to the contact step (nothing sent)", mobile: true },
  async ({ page }) => {
    await answerToContactStep(page, { business: false });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, "no sideways scrolling").toBeLessThanOrEqual(1);
    await expect(page.getByRole("button", { name: /Get my result and guides/ })).toBeVisible();
  },
);

qa(
  { id: "revalor-products/quiz/bad-input-refused", area: "AI quiz", title: "Bad name, bad email and missing consent are refused" },
  async ({ request }) => {
    const res = await request.post("/api/ai-quiz", {
      data: { ...VALID_ANSWERS, first_name: "Visit evil.example", email: "not-an-email", consent: false },
    });
    expect(res.status()).toBe(400);
    const { error } = (await res.json()) as { error: string };
    expect(error).toContain("first name");
    expect(error).toContain("valid email");
    expect(error).toContain("tick the box");
  },
);
