import { describe, expect, it } from "vitest";
import { normalizePhone, parsePhoneList } from "./phone";

describe("normalizePhone", () => {
  it("normalises common US formats to E.164", () => {
    expect(normalizePhone("(555) 234-5678")).toBe("+15552345678");
    expect(normalizePhone("555-234-5678")).toBe("+15552345678");
    expect(normalizePhone("555.234.5678")).toBe("+15552345678");
    expect(normalizePhone("5552345678")).toBe("+15552345678");
    expect(normalizePhone("1 555 234 5678")).toBe("+15552345678");
    expect(normalizePhone("+1 (555) 234-5678")).toBe("+15552345678");
  });

  it("accepts international E.164 numbers when a + is given", () => {
    expect(normalizePhone("+44 7911 123456")).toBe("+447911123456");
  });

  it("rejects numbers that can't be texted", () => {
    expect(normalizePhone("")).toBeNull();
    expect(normalizePhone("   ")).toBeNull();
    expect(normalizePhone("12345")).toBeNull();
    expect(normalizePhone("555-1234")).toBeNull(); // no area code
    expect(normalizePhone("0552345678")).toBeNull(); // US area codes start 2-9
    expect(normalizePhone("+0123456789")).toBeNull(); // country code can't start with 0
    expect(normalizePhone("not a number")).toBeNull();
  });
});

describe("parsePhoneList", () => {
  it("splits on commas, semicolons and new lines and de-duplicates", () => {
    const { valid, invalid } = parsePhoneList("(555) 234-5678, 555-234-5678\n+1 555 987 6543; ");
    expect(valid).toEqual(["+15552345678", "+15559876543"]);
    expect(invalid).toEqual([]);
  });

  it("reports the entries it couldn't parse", () => {
    const { valid, invalid } = parsePhoneList("5552345678, oops, 123");
    expect(valid).toEqual(["+15552345678"]);
    expect(invalid).toEqual(["oops", "123"]);
  });
});
