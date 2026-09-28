import { describe, expect, it } from "vitest";
import { safeNextPath } from "./safeRedirect";

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
