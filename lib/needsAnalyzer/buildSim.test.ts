import { describe, expect, it } from "vitest";
import { DEFAULT_INPUT, DEFAULT_PRICES, hostingFor, normalizeInput, priceAtMargin, simulate, type SimInput } from "./buildSim";

const RATES = { internalRate: 60, targetMarginPct: 50 };
const run = (patch: Partial<SimInput>) => simulate({ ...DEFAULT_INPUT, ...patch }, DEFAULT_PRICES, RATES);

describe("hosting fits the platform", () => {
  it("offers only matching hosts and snaps a mismatched one to the first", () => {
    expect(hostingFor("nextjs")).toEqual(["vercel", "netlify", "cloudflare"]);
    expect(hostingFor("wordpress")).toEqual(["siteground", "wpengine"]);
    expect(normalizeInput({ ...DEFAULT_INPUT, platform: "nextjs", hosting: "included" }).hosting).toBe("vercel");
    expect(normalizeInput({ ...DEFAULT_INPUT, platform: "squarespace", hosting: "vercel" }).hosting).toBe("included");
  });
  it("drops mailboxes when there's no email and keeps at least one when there is", () => {
    expect(normalizeInput({ ...DEFAULT_INPUT, email: "none", mailboxes: 3 }).mailboxes).toBe(0);
    expect(normalizeInput({ ...DEFAULT_INPUT, email: "google", mailboxes: 0 }).mailboxes).toBe(1);
  });
});

describe("simulate", () => {
  it("covers hosting through deployment, in order", () => {
    const keys = run({}).steps.map((s) => s.key);
    for (const k of ["discovery", "domain", "hosting", "ssl", "design", "build", "testing", "launch", "handoff"]) expect(keys).toContain(k);
    expect(keys.indexOf("hosting")).toBeLessThan(keys.indexOf("build"));
    expect(keys.indexOf("build")).toBeLessThan(keys.indexOf("launch"));
  });
  it("adds 15% contingency and prices the build at the target margin, rounded up to $50", () => {
    const r = run({});
    expect(r.contingencyHours).toBeCloseTo(r.buildHours * 0.15, 0);
    expect(r.buildCost).toBe(Math.round(r.totalHours * 60));
    expect(r.buildPrice).toBeGreaterThanOrEqual(r.buildCost * 2);
    expect(r.buildPrice % 50).toBe(0);
  });
  it("costs more for bigger, custom, Revalor-written sites", () => {
    expect(run({ size: "large" }).totalHours).toBeGreaterThan(run({ size: "small" }).totalHours);
    expect(run({ design: "custom" }).totalHours).toBeGreaterThan(run({ design: "template" }).totalHours);
    expect(run({ content: "revalor" }).totalHours).toBeGreaterThan(run({ content: "client" }).totalHours);
  });
  it("splits running costs by who pays: Revalor hosts custom sites, clients pay for builders", () => {
    const custom = run({ platform: "nextjs", hosting: "vercel" });
    expect(custom.running.find((l) => l.key === "hosting")).toMatchObject({ monthly: 20, payer: "Revalor" });
    expect(custom.runningMonthlyRevalor).toBe(20);
    const sq = run({ platform: "squarespace" });
    expect(sq.running.find((l) => l.key === "hosting")).toBeUndefined();
    expect(sq.running.find((l) => l.key === "platform")).toMatchObject({ monthly: 19, payer: "Client" });
    expect(sq.runningMonthlyRevalor).toBe(0);
  });
  it("adds the store tier, email per mailbox, booking app and domain per month", () => {
    const r = run({ platform: "squarespace", features: ["store", "booking"], email: "google", mailboxes: 3 });
    expect(r.running.find((l) => l.key === "platform")!.monthly).toBe(29);
    expect(r.running.find((l) => l.key === "email")!.monthly).toBe(21);
    expect(r.running.find((l) => l.key === "app-booking")!.monthly).toBe(12);
    expect(r.running.find((l) => l.key === "domain")!.monthly).toBeCloseTo(11 / 12, 2);
    expect(r.runningYearly).toBe(Math.round(r.runningMonthly * 12));
  });
  it("prices the care plan from hours and flags the risks that apply", () => {
    expect(run({ care: "none" }).carePrice).toBe(0);
    expect(run({ care: "full" }).careCost).toBe(180);
    expect(run({ care: "full" }).carePrice).toBe(360);
    expect(run({ platform: "nextjs", care: "none" }).risks.join(" ")).toMatch(/no care plan/i);
    expect(run({ platform: "wordpress" }).risks.join(" ")).toMatch(/WordPress needs regular/);
  });
  it("uses on-screen price overrides", () => {
    const prices = { ...DEFAULT_PRICES, hostingMonthly: { ...DEFAULT_PRICES.hostingMonthly, wpengine: 50 } };
    expect(simulate({ ...DEFAULT_INPUT, platform: "wordpress", hosting: "wpengine" }, prices, RATES).running.find((l) => l.key === "hosting")!.monthly).toBe(50);
  });
  it("priceAtMargin", () => {
    expect(priceAtMargin(100, 50)).toBe(200);
    expect(priceAtMargin(100, 0)).toBe(100);
  });
});
