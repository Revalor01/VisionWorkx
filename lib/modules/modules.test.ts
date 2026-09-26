import { describe, expect, it } from "vitest";
import { parseFormConfig, parseBrand, validateSubmission, DEFAULT_LEAD_FORM } from "./config";
import { normalizeHost, normalizeDomainList, isAllowedOrigin, frameAncestors } from "./domains";
import { csvCell, toCsv } from "./csv";
import { signWebhook, isSafeWebhookUrl } from "./webhook";
import { createHmac } from "crypto";

describe("parseFormConfig", () => {
  it("keeps valid fields and fills defaults", () => {
    const c = parseFormConfig(DEFAULT_LEAD_FORM);
    expect(c.fields.map((f) => f.id)).toEqual(["name", "email", "phone", "message"]);
    expect(c.submitLabel).toBe("Send my request");
  });
  it("drops invalid, duplicate and option-less select fields", () => {
    const c = parseFormConfig({
      fields: [
        { id: "Bad Id", type: "text" },
        { id: "a", type: "rocket" },
        { id: "b", type: "text" },
        { id: "b", type: "email" },
        { id: "c", type: "select", options: [] },
        { id: "d", type: "select", options: ["x", "", "y"] },
      ],
    });
    expect(c.fields.map((f) => f.id)).toEqual(["b", "d"]);
    expect(c.fields[1].options).toEqual(["x", "y"]);
  });
  it("only accepts https redirect URLs", () => {
    expect(parseFormConfig({ redirectUrl: "javascript:alert(1)" }).redirectUrl).toBeNull();
    expect(parseFormConfig({ redirectUrl: "http://x.com" }).redirectUrl).toBeNull();
    expect(parseFormConfig({ redirectUrl: "https://x.com/thanks" }).redirectUrl).toBe("https://x.com/thanks");
  });
  it("caps maxLength at the type default", () => {
    const c = parseFormConfig({ fields: [{ id: "n", type: "text", maxLength: 99999 }] });
    expect(c.fields[0].maxLength).toBe(200);
  });
});

describe("parseBrand", () => {
  it("rejects non-hex colors and clamps radius", () => {
    expect(parseBrand({ color: "red; background:url(x)", radius: 999 })).toEqual({ color: "#1b2542", font: "modern", radius: 24 });
    expect(parseBrand({ color: "#0F766E", font: "friendly", radius: 18 })).toEqual({ color: "#0F766E", font: "friendly", radius: 18 });
  });
});

describe("validateSubmission", () => {
  const cfg = parseFormConfig({
    fields: [
      { id: "name", type: "text", required: true, label: "Name" },
      { id: "email", type: "email", required: true, label: "Email" },
      { id: "phone", type: "phone", label: "Phone" },
      { id: "svc", type: "select", options: ["Repair", "Install"], label: "Service" },
    ],
  });
  it("accepts good input, lowercases email, ignores unknown keys", () => {
    const r = validateSubmission(cfg, { name: " Jo ", email: "JO@Example.com", svc: "Repair", evil: "x" });
    expect(r).toEqual({ ok: true, values: { name: "Jo", email: "jo@example.com", svc: "Repair" } });
  });
  it("reports each problem", () => {
    const r = validateSubmission(cfg, { email: "nope", phone: "abc", svc: "Demolition" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(Object.keys(r.errors).sort()).toEqual(["email", "name", "phone", "svc"]);
  });
  it("rejects non-object input", () => {
    expect(validateSubmission(cfg, ["x"]).ok).toBe(false);
    expect(validateSubmission(cfg, null).ok).toBe(false);
  });
  it("enforces maxLength", () => {
    const r = validateSubmission(cfg, { name: "x".repeat(201), email: "a@b.co" });
    expect(r.ok).toBe(false);
  });
});

describe("domains", () => {
  it("normalizes hosts", () => {
    expect(normalizeHost("https://WWW.Example.com/path")).toBe("www.example.com");
    expect(normalizeHost("example.com.")).toBe("example.com");
    expect(normalizeHost("not a domain")).toBeNull();
    expect(normalizeDomainList(["Example.com", "example.com", "bad host", 5])).toEqual(["example.com"]);
  });
  it("matches origins exactly", () => {
    const d = ["example.com", "www.example.com"];
    expect(isAllowedOrigin("https://example.com", d)).toBe(true);
    expect(isAllowedOrigin("https://www.example.com", d)).toBe(true);
    expect(isAllowedOrigin("https://evil-example.com", d)).toBe(false);
    expect(isAllowedOrigin("https://sub.example.com", d)).toBe(false);
    expect(isAllowedOrigin("http://example.com", d)).toBe(false);
    expect(isAllowedOrigin("null", d)).toBe(false);
    expect(isAllowedOrigin(null, d)).toBe(false);
    expect(isAllowedOrigin("http://localhost:8080", d)).toBe(false);
    expect(isAllowedOrigin("http://localhost:8080", ["localhost"])).toBe(true);
  });
  it("builds frame-ancestors", () => {
    expect(frameAncestors([])).toBe("'none'");
    expect(frameAncestors(["example.com", "localhost"])).toBe("https://example.com http://localhost:*");
  });
});

describe("csv", () => {
  it("escapes quotes, commas and newlines", () => {
    expect(csvCell('a "b", c')).toBe('"a ""b"", c"');
    expect(csvCell("x\ny")).toBe('"x\ny"');
  });
  it("neutralises spreadsheet formulas", () => {
    expect(csvCell("=HYPERLINK(1)")).toBe("'=HYPERLINK(1)");
    expect(csvCell("+1 555")).toBe("'+1 555");
  });
  it("joins rows with CRLF", () => {
    expect(toCsv(["a", "b"], [[1, null]])).toBe("a,b\r\n1,\r\n");
  });
});

describe("webhooks", () => {
  it("signs t.body with HMAC-SHA256", () => {
    const sig = signWebhook("s3cret", '{"a":1}', 1700000000);
    const expected = createHmac("sha256", "s3cret").update('1700000000.{"a":1}').digest("hex");
    expect(sig).toBe(`t=1700000000,v1=${expected}`);
  });
  it("blocks unsafe URLs", () => {
    for (const u of ["http://example.com", "https://localhost/x", "https://127.0.0.1", "https://10.0.0.5",
                     "https://169.254.169.254/latest", "https://192.168.1.1", "https://user:pw@example.com",
                     "https://db.internal", "https://[::1]/", "ftp://example.com", "not a url"]) {
      expect(isSafeWebhookUrl(u), u).toBe(false);
    }
    expect(isSafeWebhookUrl("https://hooks.zapier.com/hooks/catch/1/abc")).toBe(true);
    expect(isSafeWebhookUrl("https://8.8.8.8/hook")).toBe(true);
  });
});
