import { randomUUID } from "crypto";
import { expect, qa, test } from "../../lib/qa";
import {
  cronHeaders,
  deleteLead,
  getLead,
  insertLead,
  productsCronConfigured,
  productsDbConfigured,
  productsUnsubConfigured,
  quizTestEmail,
  unsubToken,
  updateLead,
} from "../../lib/revalorProducts";

// AI quiz follow-up emails (daily cron), occasional tips, and unsubscribe.
// Tests that send emails are onDemand (skipped nightly); every send targets
// one test lead with the routes' ?email= option, so real leads are never touched.

const CRON = "/api/cron/ai-quiz-nurture";
const TIP = "/api/admin/ai-quiz-tip";
const FIRST_TIP = "001-show-an-example";

qa(
  { id: "revalor-products/emails/routes-need-secret", area: "Emails", title: "Follow-up and tip routes refuse calls without the secret", smoke: true },
  async ({ request }) => {
    expect((await request.get(`${CRON}?dry=1`)).status()).toBe(401);
    expect((await request.get(`${CRON}?dry=1`, { headers: { Authorization: "Bearer wrong" } })).status()).toBe(401);
    expect((await request.post(`${TIP}?tip=${FIRST_TIP}&dry=1`)).status()).toBe(401);
  },
);

qa(
  { id: "revalor-products/emails/follow-up-series", area: "Emails", title: "Emails 2 → 3 sent on schedule; Email 4 skipped after a call request", onDemand: true },
  async ({ request }) => {
    test.skip(!productsDbConfigured() || !productsCronConfigured(), "PRODUCTS_SUPABASE_* / PRODUCTS_CRON_SECRET not set");
    const email = quizTestEmail("series");
    const run = async (dry = false) => {
      const res = await request.get(`${CRON}?email=${encodeURIComponent(email)}${dry ? "&dry=1" : ""}`, { headers: cronHeaders() });
      expect(res.status()).toBe(200);
      return res.json();
    };
    try {
      await insertLead(email, { wants_call: true, nurture_step: 1, next_email_at: new Date().toISOString() });
      await test.step("dry run counts Email 2 and sends nothing", async () => {
        expect(await run(true)).toMatchObject({ dry: true, due: 1, email_2: 1 });
        expect((await getLead(email))?.nurture_step).toBe(1);
      });
      await test.step("Email 2 sent, Email 3 scheduled in 4 days", async () => {
        expect(await run()).toMatchObject({ sent: { email_2: 1 }, failed: 0 });
        const lead = await getLead(email);
        expect(lead?.nurture_step).toBe(2);
        const days = (Date.parse(lead!.next_email_at!) - Date.now()) / 86_400_000;
        expect(days).toBeGreaterThan(3.9);
        expect(days).toBeLessThan(4.1);
      });
      await test.step("not due yet: nothing sent", async () => {
        expect(await run()).toMatchObject({ due: 0 });
      });
      await test.step("Email 3 sent when due", async () => {
        await updateLead(email, { next_email_at: new Date().toISOString() });
        expect(await run()).toMatchObject({ sent: { email_3: 1 }, failed: 0 });
        expect((await getLead(email))?.nurture_step).toBe(3);
      });
      await test.step("Email 4 skipped because they asked for a call; series finished", async () => {
        await updateLead(email, { next_email_at: new Date().toISOString() });
        expect(await run()).toMatchObject({ skipped_email_4: 1, sent: { email_4: 0 } });
        const lead = await getLead(email);
        expect(lead?.nurture_step).toBe(4);
        expect(lead?.next_email_at).toBeNull();
      });
    } finally {
      if (productsDbConfigured()) await deleteLead(email);
    }
  },
);

qa(
  { id: "revalor-products/emails/booked-call-stops-emails", area: "Emails", title: "A booked call stops the follow-up emails (nothing sent)" },
  async ({ request }) => {
    test.skip(!productsDbConfigured() || !productsCronConfigured(), "PRODUCTS_SUPABASE_* / PRODUCTS_CRON_SECRET not set");
    const email = quizTestEmail("booked");
    try {
      await insertLead(email, { nurture_step: 1, next_email_at: new Date().toISOString(), call_booked_at: new Date().toISOString() });
      const res = await request.get(`${CRON}?dry=1&email=${encodeURIComponent(email)}`, { headers: cronHeaders() });
      expect(await res.json()).toMatchObject({ dry: true, due: 0 });
    } finally {
      if (productsDbConfigured()) await deleteLead(email);
    }
  },
);

qa(
  { id: "revalor-products/emails/tip-sent-once", area: "Emails", title: "A tip goes to someone who finished the series, and only once", onDemand: true },
  async ({ request }) => {
    test.skip(!productsDbConfigured() || !productsCronConfigured(), "PRODUCTS_SUPABASE_* / PRODUCTS_CRON_SECRET not set");
    const email = quizTestEmail("tip");
    const send = async (dry = false) => {
      const res = await request.post(`${TIP}?tip=${FIRST_TIP}&email=${encodeURIComponent(email)}${dry ? "&dry=1" : ""}`, { headers: cronHeaders() });
      expect(res.status()).toBe(200);
      return res.json();
    };
    try {
      await insertLead(email, { nurture_step: 4, next_email_at: null });
      await test.step("dry run: eligible, nothing sent", async () => {
        expect(await send(true)).toMatchObject({ dry: true, eligible: 1 });
        expect((await getLead(email))?.last_tip_id).toBeNull();
      });
      await test.step("tip sent and recorded", async () => {
        expect(await send()).toMatchObject({ sent: 1, failed: 0 });
        expect((await getLead(email))?.last_tip_id).toBe(FIRST_TIP);
      });
      await test.step("second send: already had it", async () => {
        expect(await send()).toMatchObject({ already_had_it: 1, eligible: 0, sent: 0 });
      });
      await test.step("unknown tip id is refused", async () => {
        const res = await request.post(`${TIP}?tip=no-such-tip&dry=1`, { headers: cronHeaders() });
        expect(res.status()).toBe(404);
      });
    } finally {
      if (productsDbConfigured()) await deleteLead(email);
    }
  },
);

qa(
  { id: "revalor-products/emails/unsubscribe", area: "Emails", title: "Bad unsubscribe links are refused; a real one stops all emails", smoke: true },
  async ({ request, page }) => {
    await test.step("forged link refused", async () => {
      const res = await request.post(`/api/ai-quiz/unsubscribe?id=${randomUUID()}&t=forged-token-forged-token-forged`);
      expect(res.status()).toBe(400);
    });
    await test.step("unsubscribe page loads", async () => {
      await page.goto("/ai-quiz/unsubscribe");
      await expect(page.getByRole("heading", { name: "That link didn't work." })).toBeVisible();
    });
    if (!productsDbConfigured() || !productsUnsubConfigured()) {
      test.info().annotations.push({ type: "note", description: "Real-link step skipped: PRODUCTS_SUPABASE_* / PRODUCTS_UNSUB_SECRET not set" });
      return;
    }
    const email = quizTestEmail("unsub");
    try {
      await test.step("one-click unsubscribe with a real signed link", async () => {
        const lead = await insertLead(email, { nurture_step: 1, next_email_at: new Date().toISOString() });
        const res = await request.post(`/api/ai-quiz/unsubscribe?id=${lead.id}&t=${unsubToken(lead.id)}`);
        expect(res.status()).toBe(200);
        const after = await getLead(email);
        expect(after?.unsubscribed_at).not.toBeNull();
        expect(after?.next_email_at).toBeNull();
      });
    } finally {
      await deleteLead(email);
    }
  },
);
