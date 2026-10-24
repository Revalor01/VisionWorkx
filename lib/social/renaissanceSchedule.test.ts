import { describe, expect, it } from "vitest";
import { decideSchedule, linkAllowed, parseScheduleRequest, type ScheduleRequest } from "./renaissanceSchedule";

const now = new Date("2026-10-24T12:00:00Z");
const BRAND = "11111111-1111-4111-8111-111111111111";
const body = (o: Record<string, unknown> = {}) => ({ brandId: BRAND, platform: "facebook", caption: "Hello there", hashtags: ["ai", "bad tag"], scheduledAt: "2026-10-25T14:00:00Z", riskLevel: "low", ...o });
const req = (o: Partial<ScheduleRequest> = {}): ScheduleRequest => ({ brandId: BRAND, platform: "facebook", hook: null, caption: "Hello there", hashtags: [], linkUrl: null, scheduledAt: "2026-10-25T14:00:00Z", riskLevel: "low", autoImage: false, ...o });
const brand = (o: Record<string, unknown> = {}) => ({ name: "Revalor LLC", banned_words: ["guarantee"], autonomy_paused_at: null, autonomy_mode: "semi_autonomous" as const, website_url: "https://proactive.revalorllc.com", ...o });

describe("parseScheduleRequest", () => {
  it("accepts a valid post and drops bad hashtags", () => {
    const r = parseScheduleRequest(body(), now);
    expect(r.ok && r.req.hashtags).toEqual(["ai"]);
  });
  it("needs at least 12 hours of lead time and at most 30 days", () => {
    expect(parseScheduleRequest(body({ scheduledAt: "2026-10-24T23:00:00Z" }), now).ok).toBe(false);
    expect(parseScheduleRequest(body({ scheduledAt: "2026-10-25T00:00:00Z" }), now).ok).toBe(true);
    expect(parseScheduleRequest(body({ scheduledAt: "2026-12-01T00:00:00Z" }), now).ok).toBe(false);
  });
  it("only takes Facebook and Instagram, and https links", () => {
    expect(parseScheduleRequest(body({ platform: "tiktok" }), now).ok).toBe(false);
    const r = parseScheduleRequest(body({ linkUrl: "http://x.com" }), now);
    expect(r.ok && r.req.linkUrl).toBeNull();
  });
  it("treats an unrated post as medium risk", () => {
    const r = parseScheduleRequest(body({ riskLevel: undefined }), now);
    expect(r.ok && r.req.riskLevel).toBe("medium");
  });
});

describe("decideSchedule", () => {
  it("schedules a low-risk Facebook post", () => {
    expect(decideSchedule(req(), brand(), ["facebook"])).toEqual({ kind: "scheduled", status: "scheduled" });
  });
  it("blocks a paused brand or an unconnected platform", () => {
    expect(decideSchedule(req(), brand({ autonomy_paused_at: "2026-10-24T00:00:00Z" }), ["facebook"]).kind).toBe("blocked");
    expect(decideSchedule(req(), brand(), ["instagram"]).kind).toBe("blocked");
  });
  it("rejects banned words and sends medium risk to review", () => {
    expect(decideSchedule(req({ caption: "We guarantee it" }), brand(), ["facebook"]).kind).toBe("rejected");
    expect(decideSchedule(req({ riskLevel: "medium" }), brand(), ["facebook"]).kind).toBe("review");
  });
  it("keeps the kids safety net", () => {
    expect(decideSchedule(req({ caption: "Try our booking module" }), brand({ name: "Revalor Kids" }), ["facebook"]).kind).toBe("review");
  });
  it("holds Instagram without automatic images; with them it waits for the image", () => {
    expect(decideSchedule(req({ platform: "instagram" }), brand(), ["instagram"]).kind).toBe("review");
    expect(decideSchedule(req({ platform: "instagram", autoImage: true }), brand(), ["instagram"])).toEqual({ kind: "scheduled", status: "approved" });
  });
});

describe("brand mode and links", () => {
  it("a brand set to manual sends every post to review", () => {
    expect(decideSchedule(req(), brand({ autonomy_mode: "manual" }), ["facebook"]).kind).toBe("review");
  });
  it("checks the link for banned words and only lets the brand's site or revalorllc.com through", () => {
    expect(decideSchedule(req({ linkUrl: "https://guarantee.example.com" }), brand(), ["facebook"]).kind).toBe("rejected");
    expect(decideSchedule(req({ linkUrl: "https://elsewhere.com/x" }), brand(), ["facebook"]).kind).toBe("review");
    expect(decideSchedule(req({ linkUrl: "https://sanctum.revalorllc.com/start" }), brand(), ["facebook"]).kind).toBe("scheduled");
    expect(linkAllowed("https://proactive.revalorllc.com/a", null)).toBe(true);
    expect(linkAllowed("https://my-site.vercel.app/a", "https://my-site.vercel.app")).toBe(true);
    expect(linkAllowed("https://evilrevalorllc.com", null)).toBe(false);
  });
});
