import { describe, expect, it } from "vitest";
import { nightlyEmail } from "./notify";

const url = "https://vision-workx.vercel.app/admin/qa/runs/abc";
const run = (status: string, passed: number, failed: number, error: string | null = null) => ({ id: "abc", product_slug: "visionworkx", status, passed, failed, error });

describe("nightlyEmail", () => {
  it("lists failed tests with their failing step and links the run", () => {
    const e = nightlyEmail(run("failed", 20, 2), [{ title: "Visitor books a time", error_step: "pick a time and book" }, { title: "Estimate updates", error_step: null }], "passed", url);
    expect(e?.subject).toContain("2 failed");
    expect(e?.text).toContain("• Visitor books a time — failed at: pick a time and book");
    expect(e?.text).toContain("• Estimate updates");
    expect(e?.text).toContain(url);
  });

  it("explains a run that couldn't complete", () => {
    const e = nightlyEmail(run("error", 0, 0, "Chromium failed to install"), [], "passed", url);
    expect(e?.text).toContain("couldn't complete");
    expect(e?.text).toContain("Chromium failed to install");
  });

  it("stays quiet on a normal green night", () => {
    expect(nightlyEmail(run("passed", 23, 0), [], "passed", url)).toBeNull();
    expect(nightlyEmail(run("passed", 23, 0), [], null, url)).toBeNull();
  });

  it("says so once when it's green again after a red night", () => {
    const e = nightlyEmail(run("passed", 23, 0), [], "failed", url);
    expect(e?.subject).toContain("green again");
  });

  it("caps a long failure list", () => {
    const many = Array.from({ length: 20 }, (_, i) => ({ title: `Test ${i}`, error_step: null }));
    expect(nightlyEmail(run("failed", 3, 20), many, "passed", url)?.text).toContain("…and 5 more");
  });
});
