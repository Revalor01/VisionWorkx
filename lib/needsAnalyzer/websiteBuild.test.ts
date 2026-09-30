import { describe, expect, it } from "vitest";
import { DEFAULT_CATALOG } from "./defaults";
import type { WebsiteBuild } from "./types";
import { websiteBuildProgress, websiteBuildSummary } from "./websiteBuild";

// The Website builder feeds a client-facing proposal section, so the summary must
// stay client-safe: nothing renders unless the operator opted in and picked a path,
// and effort/margin never leak into it.

describe("websiteBuildSummary", () => {
  it("returns null until the operator opts in", () => {
    expect(websiteBuildSummary(undefined, DEFAULT_CATALOG)).toBeNull();
    expect(websiteBuildSummary({ path: "builder" }, DEFAULT_CATALOG)).toBeNull(); // not shown
    expect(websiteBuildSummary({ showInProposal: true }, DEFAULT_CATALOG)).toBeNull(); // no path
  });

  it("describes the builder path in the client's account", () => {
    const wb: WebsiteBuild = { path: "builder", builderTool: "Squarespace", showInProposal: true, domain: "acme.com", domainOwnedByClient: true };
    const s = websiteBuildSummary(wb, DEFAULT_CATALOG)!;
    expect(s.approach).toContain("Squarespace");
    expect(s.approach).toContain("own it");
    expect(s.domain).toContain("acme.com");
  });

  it("shows the retainer for the custom path and never leaks build effort", () => {
    const wb: WebsiteBuild = {
      path: "custom",
      showInProposal: true,
      monthlyMaintenance: 150,
      buildDays: "3 days at internal rate", // operator-only effort note
      pieces: { privacyPolicy: true, analytics: true },
      handoff: { domainRecorded: true },
    };
    const s = websiteBuildSummary(wb, DEFAULT_CATALOG)!;
    expect(s.maintenance).toContain("150");
    expect(s.included).toContain("a privacy policy");
    expect(s.included).toContain("website analytics");
    expect(s.handoff).toBeTruthy();
    // The build-effort note is operator-only; it must never reach the client summary.
    const flat = JSON.stringify(s);
    expect(flat).not.toContain("internal rate");
    expect(flat).not.toContain("3 days");
  });

  it("omits the retainer line on the builder path", () => {
    const wb: WebsiteBuild = { path: "builder", showInProposal: true, monthlyMaintenance: 150 };
    expect(websiteBuildSummary(wb, DEFAULT_CATALOG)!.maintenance).toBeUndefined();
  });
});

describe("websiteBuildProgress", () => {
  it("counts ticked pieces and handoff items", () => {
    const p = websiteBuildProgress({ pieces: { privacyPolicy: true, analytics: true }, handoff: { domainRecorded: true } });
    expect(p).toMatchObject({ piecesDone: 2, piecesTotal: 5, handoffDone: 1, handoffTotal: 4 });
  });

  it("is all-zero when empty", () => {
    expect(websiteBuildProgress(undefined)).toMatchObject({ piecesDone: 0, handoffDone: 0 });
  });
});
