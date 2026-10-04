import { describe, expect, it } from "vitest";
import { findBrand, validateCampaign } from "./campaignImport";

const NOW = Date.parse("2026-10-04T12:00:00Z");
const LATER = "2026-10-12T10:00:00-04:00";

const fb = (over: Record<string, unknown> = {}) => ({
  platform: "facebook",
  caption: "Define the problem. Get a better answer.",
  hashtags: ["#AI", "SmallBusiness"],
  linkUrl: "https://products.revalorllc.com/ai-quiz?src=facebook-p7",
  scheduledAt: LATER,
  ...over,
});

describe("validateCampaign", () => {
  it("schedules Facebook and drafts Instagram on the planned time", () => {
    const r = validateCampaign(
      { brand: "Revalor LLC", posts: [fb(), { platform: "instagram", caption: "Link in bio.", scheduledAt: LATER }] },
      NOW,
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.posts[0]).toMatchObject({ status: "scheduled", hashtags: ["AI", "SmallBusiness"], scheduledAt: "2026-10-12T14:00:00.000Z" });
    expect(r.posts[1]).toMatchObject({ status: "draft", linkUrl: null, scheduledAt: "2026-10-12T14:00:00.000Z" });
  });

  it("rejects links on Instagram, non-https links and past times", () => {
    const r = validateCampaign(
      {
        brand: "x",
        posts: [
          { platform: "instagram", caption: "c", linkUrl: "https://example.com", scheduledAt: LATER },
          fb({ linkUrl: "http://example.com" }),
          fb({ linkUrl: "javascript:alert(1)" }),
          fb({ scheduledAt: "2026-10-01T10:00:00Z" }),
        ],
      },
      NOW,
    );
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.errors).toHaveLength(4);
  });

  it("rejects bad platforms, empty captions, bad hashtags and too many posts", () => {
    const bad = validateCampaign(
      { brand: "x", posts: [fb({ platform: "tiktok" }), fb({ caption: "  " }), fb({ hashtags: ["no spaces"] })] },
      NOW,
    );
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.errors).toHaveLength(3);

    const many = validateCampaign({ brand: "x", posts: Array.from({ length: 51 }, () => fb()) }, NOW);
    expect(many.ok).toBe(false);
  });

  it("needs a brand and a posts list", () => {
    expect(validateCampaign({ posts: [fb()] }, NOW).ok).toBe(false);
    expect(validateCampaign({ brand: "x", posts: [] }, NOW).ok).toBe(false);
    expect(validateCampaign([], NOW).ok).toBe(false);
  });
});

describe("findBrand", () => {
  const brands = [
    { id: "1", name: "Revalor LLC", slug: "revalor" },
    { id: "2", name: "VisionWorkx", slug: "visionworkx" },
  ];
  it("matches slug or name, ignoring case", () => {
    expect(findBrand(brands, "revalor llc")?.id).toBe("1");
    expect(findBrand(brands, "VISIONWORKX")?.id).toBe("2");
    expect(findBrand(brands, "nope")).toBeNull();
  });
});
