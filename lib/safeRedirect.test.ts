import { describe, expect, it } from "vitest";
import { safeNextPath, safeNextPathWithin } from "./safeRedirect";

const FALLBACK = "/dashboard";

describe("safeNextPath", () => {
  it.each([
    ["/partner", "/partner"],
    ["/guided/booked", "/guided/booked"],
    ["/dashboard?tab=apps", "/dashboard?tab=apps"],
    ["/admin#payments", "/admin#payments"],
    ["/", "/"],
  ])("keeps same-site path %s", (input, expected) => {
    expect(safeNextPath(input, FALLBACK)).toBe(expected);
  });

  it.each([
    ["missing", null],
    ["undefined", undefined],
    ["empty", ""],
    ["absolute https", "https://evil.example"],
    ["absolute http", "http://evil.example/login"],
    ["protocol-relative", "//evil.example"],
    ["backslash host", "/\\evil.example"],
    ["double backslash", "\\\\evil.example"],
    ["backslash later in path", "/foo\\..\\..\\evil"],
    ["javascript URL", "javascript:alert(1)"],
    ["data URL", "data:text/html,hi"],
    ["relative without slash", "evil.example"],
    ["tab-smuggled slashes", "/\t/evil.example"],
    ["newline-smuggled slashes", "/\n/evil.example"],
    // Dot segments that only collapse into "//host" once the URL is parsed.
    ["dot then double slash", "/.//evil.example"],
    ["dot-dot then double slash", "/a/..//evil.example"],
    ["encoded dot then double slash", "/%2e//evil.example"],
    ["encoded dot-dot then double slash", "/%2E%2E//evil.example"],
    ["overlong", "/" + "a".repeat(2048)],
  ])("rejects %s", (_label, input) => {
    expect(safeNextPath(input as string | null | undefined, FALLBACK)).toBe(FALLBACK);
  });

  it("normalises dot segments but stays on-site", () => {
    expect(safeNextPath("/a/../partner", FALLBACK)).toBe("/partner");
  });

  it("keeps percent-encoded slashes as a path, not a host", () => {
    expect(safeNextPath("/%2F%2Fevil.example", FALLBACK)).toBe("/%2F%2Fevil.example");
  });
});

describe("safeNextPathWithin", () => {
  const AREA = "/workspace";

  it.each([
    ["/workspace", "/workspace"],
    ["/workspace/onboarding", "/workspace/onboarding"],
    ["/workspace/acme", "/workspace/acme"],
    ["/workspace/acme/settings?tab=billing", "/workspace/acme/settings?tab=billing"],
    ["/workspace?welcome=1", "/workspace?welcome=1"],
    ["/workspace#top", "/workspace#top"],
  ])("keeps %s", (input, expected) => {
    expect(safeNextPathWithin(input, AREA)).toBe(expected);
  });

  it.each([
    ["missing", null],
    ["another app area", "/admin"],
    ["prefix look-alike", "/workspaces-x"],
    ["dot-dot out of the area", "/workspace/../admin"],
    ["encoded dot-dot out of the area", "/workspace/%2e%2e/admin"],
    ["protocol-relative", "//evil.example"],
    ["backslash host", "/\\evil.example"],
    ["dot segment to protocol-relative", "/workspace/../..//evil.example"],
    ["absolute URL", "https://evil.example/workspace"],
  ])("falls back for %s", (_label, input) => {
    expect(safeNextPathWithin(input as string | null, AREA)).toBe(AREA);
  });
});
