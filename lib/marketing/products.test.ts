import { describe, expect, it } from "vitest";
import { audienceProfileTable, getMarketingProduct, MARKETING_PRODUCTS } from "./products";

describe("marketing audiences", () => {
  it("reads Sanctum and Proactive members from Revalor Wellness, not the retired per-app projects", () => {
    for (const slug of ["sanctum", "proactive"] as const) {
      const src = getMarketingProduct(slug).audienceSource;
      expect(src).toMatchObject({ kind: "remote", projectRef: "eqopjnucrfzlcdfgyhqc", schema: slug });
      expect(audienceProfileTable(src)).toBe(`${slug}.users_profile`);
    }
    const refs = MARKETING_PRODUCTS.map((p) => (p.audienceSource.kind === "remote" ? p.audienceSource.projectRef : null));
    expect(refs).not.toContain("qpbwnfvdjklmdrftbkcu");
    expect(refs).not.toContain("opfkrmmjprrqqxpoiynx");
  });

  it("keeps the Kids products on <schema>.profiles", () => {
    expect(audienceProfileTable(getMarketingProduct("chorebit").audienceSource)).toBe("chorebit.profiles");
  });

  it("has no member table for a whole-project or local audience", () => {
    expect(audienceProfileTable({ kind: "local" })).toBeNull();
    expect(audienceProfileTable({ kind: "remote", projectRef: "x" })).toBeNull();
  });
});
