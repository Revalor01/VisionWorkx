import { describe, expect, it } from "vitest";
import { pickPublishable } from "./publishSpacing";

const post = (id: string, platform: string, brand_id: string, scheduled_at: string) => ({ id, platform, brand_id, scheduled_at });
const pages: Record<string, string> = { llc: "P1", kids: "P1", vw: "P2" };

describe("pickPublishable", () => {
  it("sends one Facebook post per Page per run, oldest first", () => {
    const { now, deferred } = pickPublishable(
      [post("kids", "facebook", "kids", "2026-10-15T14:00:00Z"), post("llc", "facebook", "llc", "2026-10-15T13:59:00Z"), post("vw", "facebook", "vw", "2026-10-15T14:00:00Z")],
      (b) => pages[b],
    );
    expect(now.map((p) => p.id)).toEqual(["llc", "vw"]);
    expect(deferred.map((p) => p.id)).toEqual(["kids"]);
  });
  it("leaves other platforms and Page-less brands alone", () => {
    const { now, deferred } = pickPublishable(
      [post("a", "instagram", "llc", "2026-10-15T14:00:00Z"), post("b", "instagram", "kids", "2026-10-15T14:00:00Z"), post("c", "facebook", "none", "2026-10-15T14:00:00Z"), post("d", "facebook", "none", "2026-10-15T14:00:00Z")],
      (b) => pages[b] ?? null,
    );
    expect(now).toHaveLength(4);
    expect(deferred).toHaveLength(0);
  });
});
