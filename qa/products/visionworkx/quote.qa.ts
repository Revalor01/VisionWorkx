import { expect, qa, test } from "../../lib/qa";
import { createModule, formConfig, modulesAdmin, NAME_FIELD, openHostPage, waitFor } from "../../lib/modules";
import { computeEstimate, defaultAnswers, parseQuotePricing } from "../../../lib/modules/quote";

// Quote calculator: the visitor's live estimate must match the pricing math
// (checked against the same computeEstimate the product uses).

const PRICING = parseQuotePricing({
  basePriceCents: 10_000,
  inputs: [
    { kind: "counter", id: "rooms", label: "Rooms", min: 1, max: 5, default: 1, pricePerUnitCents: 2_000 },
    { kind: "choice", id: "size", label: "Home size", options: [{ label: "Small", priceCents: 0 }, { label: "Large", priceCents: 5_000 }] },
  ],
  frequency: null,
  rangeLowPct: 10,
  rangeHighPct: 10,
  roundToDollars: 5,
  minimumCents: 0,
  unitLabel: "",
});

qa(
  { id: "visionworkx/quote/estimate-and-submit", area: "Quote calculator", title: "Estimate updates with answers and the lead is saved", smoke: true, mobile: true },
  async ({ page, qaWorkspace }) => {
    const mod = await createModule(qaWorkspace.id, "quote_calculator", { ...formConfig([NAME_FIELD]), quote: PRICING });
    await openHostPage(page, mod.publicId);
    const form = page.frameLocator("iframe").first();
    const shown = form.locator(".vwm-q-est strong");

    const start = defaultAnswers(PRICING);
    await test.step("default answers show the right range", async () => {
      await expect(shown).toHaveText(computeEstimate(PRICING, start).text);
    });

    const changed = { ...start, rooms: 2, size: 1 };
    const expected = computeEstimate(PRICING, changed).text;
    await test.step("changing answers recalculates", async () => {
      await form.getByRole("button", { name: "More rooms" }).click();
      await form.getByText("Large", { exact: true }).click();
      await expect(shown).toHaveText(expected);
      expect(expected, "sanity: the estimate actually changed").not.toBe(computeEstimate(PRICING, start).text);
    });

    await test.step("visitor sends their details", async () => {
      await form.getByRole("button", { name: "Get my exact quote" }).click();
      await form.getByLabel("Full name").fill("QA Quote Visitor");
      await form.getByRole("button", { name: "Send" }).click();
      await expect(form.getByText("Thanks — QA got it.")).toBeVisible();
    });

    await test.step("the saved lead carries the same estimate", async () => {
      const sub = await waitFor(async () => {
        const { data } = await modulesAdmin().from("vw_submissions").select("data").eq("workspace_id", qaWorkspace.id).maybeSingle();
        return data;
      }, "the submission row");
      expect(JSON.stringify(sub.data)).toContain(expected);
    });
  },
);
