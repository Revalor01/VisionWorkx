import { describe, expect, it, vi } from "vitest";
vi.mock("./supabase", () => ({ modulesServiceClient: vi.fn() }));
import { billingAllowsService, gateSubmission, limitsFor, PLAN_LIMITS } from "./plans";
import { billingStatusFrom, planFromPriceId, trialDaysForNewSubscription } from "./billing";

describe("plan limits", () => {
  it("has no free tier and falls back to Starter", () => {
    expect(Object.keys(PLAN_LIMITS)).toEqual(["starter", "growth", "pro"]);
    expect(limitsFor("free")).toEqual(PLAN_LIMITS.starter);
    expect(limitsFor(undefined)).toEqual(PLAN_LIMITS.starter);
  });
  it("gives at least 2 emails per included submission (confirmation + alert)", () => {
    for (const l of Object.values(PLAN_LIMITS)) expect(l.emailsPerMonth).toBeGreaterThanOrEqual(2 * l.submissionsPerMonth);
  });
});

describe("submission soft limit (Starter: 500 included)", () => {
  it("warns once at 80% and at 100%", () => {
    expect(gateSubmission(398, 500)).toEqual({ allow: true, alert: null });
    expect(gateSubmission(399, 500)).toEqual({ allow: true, alert: "submissions_80" });
    expect(gateSubmission(499, 500)).toEqual({ allow: true, alert: "submissions_100" });
    expect(gateSubmission(500, 500)).toEqual({ allow: true, alert: null });
  });
  it("keeps accepting up to 150%, then pauses", () => {
    expect(gateSubmission(749, 500).allow).toBe(true);
    expect(gateSubmission(750, 500)).toEqual({ allow: false, alert: "submissions_150" });
  });
});

describe("billing", () => {
  it("only runs forms for trialing/active/past_due/comped", () => {
    expect(["trialing", "active", "past_due", "comped"].every(billingAllowsService)).toBe(true);
    expect(["none", "canceled", undefined, "free"].some((s) => billingAllowsService(s as string))).toBe(false);
  });
  it("maps Stripe statuses", () => {
    expect(billingStatusFrom("trialing")).toBe("trialing");
    expect(billingStatusFrom("unpaid")).toBe("past_due");
    expect(billingStatusFrom("incomplete")).toBe("none");
    expect(billingStatusFrom("incomplete_expired")).toBe("canceled");
    expect(billingStatusFrom("canceled")).toBe("canceled");
  });
  it("gives the 14-day trial once per workspace", () => {
    expect(trialDaysForNewSubscription({ stripe_subscription_id: null, billing_status: "none" })).toBe(14);
    expect(trialDaysForNewSubscription({ stripe_subscription_id: "sub_1", billing_status: "canceled" })).toBeUndefined();
  });
  it("maps price ids to plans", () => {
    vi.stubEnv("STRIPE_GROWTH_ANNUAL_PRICE_ID", "price_growth_yr");
    expect(planFromPriceId("price_growth_yr")).toBe("growth");
    expect(planFromPriceId("price_unknown")).toBeNull();
    vi.unstubAllEnvs();
  });
});
