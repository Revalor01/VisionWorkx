import { describe, expect, it } from "vitest";
import { kidsTermHits, parseVerdict } from "./childSafety";

describe("kidsTermHits", () => {
  it("catches kids-unsafe terms on word boundaries", () => {
    expect(kidsTermHits("Mom's wine night after chores!")).toEqual(["wine"]);
    expect(kidsTermHits("Clean up the spills together")).toEqual([]);
    expect(kidsTermHits("Earn crypto for chores")).toEqual(["crypto"]);
  });
});

describe("parseVerdict — fails closed", () => {
  it("passes only an explicit 'appropriate: true'", () => {
    expect(parseVerdict("end_turn", JSON.stringify({ appropriate_for_age_12_and_under: true, reasons: [] }))).toEqual({ safe: true });
  });
  it("fails an 'appropriate: false' with its reasons", () => {
    const v = parseVerdict("end_turn", JSON.stringify({ appropriate_for_age_12_and_under: false, reasons: ["scary imagery", "mentions dating"] }));
    expect(v).toEqual({ safe: false, reason: "scary imagery; mentions dating" });
  });
  it("fails on refusal, truncation, missing text, bad JSON or a non-boolean answer", () => {
    expect(parseVerdict("refusal", null).safe).toBe(false);
    expect(parseVerdict("max_tokens", '{"appropriate_for_age_12_and_under": true').safe).toBe(false);
    expect(parseVerdict("end_turn", null).safe).toBe(false);
    expect(parseVerdict("end_turn", "not json").safe).toBe(false);
    expect(parseVerdict("end_turn", JSON.stringify({ appropriate_for_age_12_and_under: "yes", reasons: [] })).safe).toBe(false);
  });
});
