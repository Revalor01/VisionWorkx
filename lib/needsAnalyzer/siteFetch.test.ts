import { describe, expect, it } from "vitest";
import { isBlockedAddress, normalizeSiteUrl } from "./siteFetch";

// The website check fetches operator-typed addresses from our servers, so these
// guard against it being pointed at anything internal.

describe("normalizeSiteUrl", () => {
  it("accepts bare domains and full addresses", () => {
    expect(normalizeSiteUrl("example.com").href).toBe("https://example.com/");
    expect(normalizeSiteUrl("  www.example.com/contact#top ").href).toBe("https://www.example.com/contact");
    expect(normalizeSiteUrl("http://example.com").protocol).toBe("http:");
  });

  it("refuses other schemes, credentials, odd ports and internal names", () => {
    for (const bad of [
      "",
      "ftp://example.com",
      "file:///etc/passwd",
      "javascript:alert(1)",
      "https://user:pw@example.com",
      "https://example.com:8080",
      "localhost",
      "http://localhost:80",
      "https://printer.local",
      "https://db.internal",
      "intranet",
    ])
      expect(() => normalizeSiteUrl(bad), bad).toThrow();
  });
});

describe("isBlockedAddress", () => {
  it("blocks private, loopback, link-local, metadata and reserved ranges", () => {
    for (const ip of [
      "127.0.0.1",
      "10.1.2.3",
      "172.16.0.1",
      "172.31.255.255",
      "192.168.1.1",
      "169.254.169.254",
      "100.64.0.1",
      "0.0.0.0",
      "224.0.0.1",
      "255.255.255.255",
      "::1",
      "::",
      "fc00::1",
      "fd12:3456::1",
      "fe80::1",
      "::ffff:127.0.0.1",
      "::ffff:7f00:1",
      "2001:db8::1",
      "::7f00:1",
      "::127.0.0.1",
      "::ffff:0:7f00:1",
      "2002:7f00:1::1",
      "2001:0:4136:e378::1",
      "fec0::1",
      "64:ff9b::7f00:1",
      "not-an-ip",
    ])
      expect(isBlockedAddress(ip), ip).toBe(true);
  });

  it("allows public addresses", () => {
    for (const ip of ["8.8.8.8", "93.184.216.34", "172.32.0.1", "2606:4700:4700::1111", "2001:4860:4860::8888", "::ffff:8.8.8.8"]) expect(isBlockedAddress(ip), ip).toBe(false);
  });
});
