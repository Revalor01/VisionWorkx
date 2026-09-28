import { describe, expect, it } from "vitest";
import { artifactPath, countResults, finalResults, finalRunStatus, grepFor, isStale, mapPlaywrightStatus, stripAnsi, TEST_ID_RE } from "./summary";

describe("finalResults / countResults", () => {
  const results = [
    { test_id: "p/a/one", status: "failed" as const, attempt: 1 },
    { test_id: "p/a/one", status: "passed" as const, attempt: 2 },
    { test_id: "p/a/two", status: "failed" as const, attempt: 1 },
    { test_id: "p/a/three", status: "skipped" as const, attempt: 1 },
    { test_id: "p/a/four", status: "flaky" as const, attempt: 2 },
  ];
  it("keeps only the latest attempt per test", () => {
    expect(finalResults(results).find((r) => r.test_id === "p/a/one")?.status).toBe("passed");
    expect(finalResults(results)).toHaveLength(4);
  });
  it("counts a retried pass and a flaky test as passed", () => {
    expect(countResults(results)).toEqual({ passed: 2, failed: 1, skipped: 1 });
  });
});

describe("finalRunStatus", () => {
  it("fails when any test failed", () => expect(finalRunStatus({ passed: 5, failed: 1 }, "failed")).toBe("failed"));
  it("passes when everything passed", () => expect(finalRunStatus({ passed: 3, failed: 0 }, "passed")).toBe("passed"));
  it("is an error when nothing ran", () => expect(finalRunStatus({ passed: 0, failed: 0 }, "passed")).toBe("error"));
  it("is an error when the runner was interrupted", () => expect(finalRunStatus({ passed: 2, failed: 0 }, "interrupted")).toBe("error"));
  it("is an error when the runner failed but no test did (setup crash)", () => expect(finalRunStatus({ passed: 0, failed: 0 }, "failed")).toBe("error"));
});

describe("mapPlaywrightStatus", () => {
  it("maps statuses", () => {
    expect(mapPlaywrightStatus("passed", 0)).toBe("passed");
    expect(mapPlaywrightStatus("passed", 1)).toBe("flaky");
    expect(mapPlaywrightStatus("timedOut", 0)).toBe("timed_out");
    expect(mapPlaywrightStatus("interrupted", 0)).toBe("failed");
    expect(mapPlaywrightStatus("skipped", 0)).toBe("skipped");
  });
});

describe("grepFor", () => {
  it("smoke and all", () => {
    expect(grepFor("smoke", [])).toBe("@smoke");
    expect(grepFor("all", ["x/y/z"])).toBe("");
  });
  it("matches exactly the picked ids, not ids that start the same", () => {
    const re = new RegExp(grepFor("custom", ["visionworkx/forms/submit", "visionworkx/booking/book"]));
    expect(re.test("Title @visionworkx/forms/submit @smoke")).toBe(true);
    expect(re.test("Title @visionworkx/booking/book")).toBe(true);
    expect(re.test("Title @visionworkx/forms/submit-with-file")).toBe(false);
    expect(re.test("Title @visionworkx/forms/submit/extra")).toBe(false);
    expect(re.test("Title @visionworkx/forms/other")).toBe(false);
  });
  it("selects the base test for a phone (--mobile) entry", () => {
    expect(grepFor("custom", ["visionworkx/forms/submit--mobile", "visionworkx/forms/submit"])).toBe("@visionworkx/forms/submit(?![\\w/-])");
  });
});

describe("helpers", () => {
  it("builds artifact paths the artifact route accepts", () => {
    const p = artifactPath("0f8fad5b-d9cb-469f-a165-70867728950e", "visionworkx/forms/submit", 2, "trace");
    expect(p).toBe("0f8fad5b-d9cb-469f-a165-70867728950e/visionworkx__forms__submit/attempt-2-trace.zip");
    expect(/^[0-9a-f-]{36}\/[a-z0-9_-]+\/attempt-\d+-(screenshot\.png|trace\.zip|video\.webm)$/.test(p)).toBe(true);
  });
  it("validates test ids", () => {
    expect(TEST_ID_RE.test("visionworkx/forms/submit")).toBe(true);
    expect(TEST_ID_RE.test("visionworkx/forms")).toBe(false);
    expect(TEST_ID_RE.test("VisionWorkx/Forms/Submit")).toBe(false);
  });
  it("flags runs that never started", () => {
    const now = Date.parse("2026-09-28T12:00:00Z");
    expect(isStale({ status: "queued", created_at: "2026-09-28T11:30:00Z" }, now)).toBe(true);
    expect(isStale({ status: "queued", created_at: "2026-09-28T11:55:00Z" }, now)).toBe(false);
    expect(isStale({ status: "running", created_at: "2026-09-28T10:00:00Z" }, now)).toBe(false);
  });
  it("strips terminal colours from errors", () => expect(stripAnsi("\u001b[31mExpected\u001b[39m")).toBe("Expected"));
});
