import { describe, expect, it } from "vitest";
import { evaluateApproval } from "./riskEvaluator";

const base = { bannedWords: [], autonomyMode: "fully_autonomous" as const, riskLevel: "low" as const };

describe("evaluateApproval — kids safety", () => {
  it("holds off-brand (VisionWorkx) copy on a kids brand for review", () => {
    const r = evaluateApproval({ ...base, copy: "Chorebit now integrates with VisionWorkx booking modules!", audience: "kids" });
    expect(r.status).toBe("review");
    expect(r.reason).toMatch(/off-brand|kid-appropriate/i);
  });

  it("holds not-age-appropriate copy on a kids brand for review", () => {
    expect(evaluateApproval({ ...base, copy: "Try our new weight loss supplement", audience: "kids" }).status).toBe("review");
  });

  it("does not false-positive on innocent words (spills vs pills)", () => {
    const r = evaluateApproval({ ...base, copy: "No more spills at snack time with MindBit!", audience: "kids" });
    expect(r.status).toBe("auto");
  });

  it("auto-approves clean, on-brand, low-risk kids copy", () => {
    expect(evaluateApproval({ ...base, copy: "Kids love earning points for their chores with Chorebit.", audience: "kids" }).status).toBe("auto");
  });

  it("never lets a kids brand run fully-autonomous (medium risk -> review)", () => {
    expect(evaluateApproval({ ...base, riskLevel: "medium", copy: "A fun kids update", audience: "kids" }).status).toBe("review");
    // a business brand in fully-autonomous mode still auto-approves medium risk
    expect(evaluateApproval({ ...base, riskLevel: "medium", copy: "A business update", audience: "business" }).status).toBe("auto");
  });

  it("leaves business brands' content untouched by the kids gate", () => {
    expect(evaluateApproval({ ...base, copy: "VisionWorkx adds booking to your site.", audience: "business" }).status).toBe("auto");
  });

  it("still rejects configured banned words first", () => {
    expect(evaluateApproval({ ...base, copy: "a forbidden word here", bannedWords: ["forbidden"], audience: "kids" }).status).toBe("reject");
  });
});
