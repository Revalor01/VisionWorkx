import { describe, expect, it } from "vitest";
import { holdPaused, pickPublishable } from "./publishSpacing";

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

describe("holdPaused", () => {
  const now = new Date("2026-10-24T12:00:00Z");
  const p = (id: string, brand_id: string, generated_by: string | null, scheduled_at = "2026-10-24T11:50:00Z") => ({ id, brand_id, generated_by, scheduled_at });
  it("holds automatic posts of a paused brand and lets everything else go", () => {
    const { go, held } = holdPaused([p("auto-paused", "a", "autonomous"), p("manual-paused", "a", "manual"), p("auto-live", "b", "autonomous"), p("engine-paused", "a", "content_engine")], (b) => b === "a", now);
    expect(held.map((x) => x.id)).toEqual(["auto-paused"]);
    expect(go.map((x) => x.id)).toEqual(["manual-paused", "auto-live", "engine-paused"]);
  });
  it("sends automatic posts more than 6 hours late back to drafts instead of posting them", () => {
    const { go, held, stale } = holdPaused([p("old-auto", "b", "autonomous", "2026-10-24T05:00:00Z"), p("old-manual", "b", "manual", "2026-10-24T05:00:00Z"), p("old-auto-paused", "a", "autonomous", "2026-10-22T14:00:00Z")], (b) => b === "a", now);
    expect(stale.map((x) => x.id)).toEqual(["old-auto", "old-auto-paused"]);
    expect(go.map((x) => x.id)).toEqual(["old-manual"]);
    expect(held).toEqual([]);
  });
});
