import { describe, expect, it } from "vitest";
import { isLinkedinImagePath, linkedinImagePrefix } from "./linkedinImage";

describe("isLinkedinImagePath", () => {
  const id = "11111111-2222-4333-8444-555555555555";
  it("accepts a jpg/png in the post's own folder", () => {
    expect(isLinkedinImagePath(id, `${linkedinImagePrefix(id)}abc-123.png`)).toBe(true);
    expect(isLinkedinImagePath(id, `${linkedinImagePrefix(id)}abc-123.jpg`)).toBe(true);
  });
  it("rejects other folders, traversal and other types", () => {
    expect(isLinkedinImagePath(id, "linkedin/other-post/abc.png")).toBe(false);
    expect(isLinkedinImagePath(id, `${linkedinImagePrefix(id)}../x.png`)).toBe(false);
    expect(isLinkedinImagePath(id, `${linkedinImagePrefix(id)}sub/abc.png`)).toBe(false);
    expect(isLinkedinImagePath(id, `${linkedinImagePrefix(id)}abc.webp`)).toBe(false);
    expect(isLinkedinImagePath(id, "brand/abc.png")).toBe(false);
  });
});
