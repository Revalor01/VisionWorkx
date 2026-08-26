import { createHmac } from "crypto";
import { describe, expect, it } from "vitest";
import { signTicket, verifyTicket, signSessionCookie, verifySessionCookie, ADMIN_EMAIL } from "./adminSso";

// This is the cross-app admin SSO trust boundary shared across every
// Revalor app (ADMIN_SSO_SECRET must match on all of them) — a bug here
// means either locked-out admins or forged access to VisionWorkx's own
// /admin pages, so the failure modes are worth testing explicitly.

// Matches vitest.config.ts's test.env.ADMIN_SSO_SECRET — used to build
// genuinely validly-signed tokens by hand for the expiry test, so it
// exercises the expiry check specifically, not a signature mismatch.
const TEST_SECRET = "test-secret-do-not-use-in-prod";

function signManually(payload: object): string {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = createHmac("sha256", TEST_SECRET).update(body).digest("base64url");
  return `${body}.${sig}`;
}

describe("signTicket / verifyTicket", () => {
  it("verifies a freshly signed ticket for the matching email", () => {
    const ticket = signTicket(ADMIN_EMAIL);
    expect(verifyTicket(ticket, ADMIN_EMAIL)).toBe(true);
  });

  it("is case-insensitive on email comparison", () => {
    const ticket = signTicket(ADMIN_EMAIL.toUpperCase());
    expect(verifyTicket(ticket, ADMIN_EMAIL)).toBe(true);
  });

  it("rejects a ticket issued for a different email", () => {
    const ticket = signTicket("someone-else@example.com");
    expect(verifyTicket(ticket, ADMIN_EMAIL)).toBe(false);
  });

  it("rejects a ticket with a tampered signature", () => {
    const ticket = signTicket(ADMIN_EMAIL);
    const [body, sig] = ticket.split(".");
    const tamperedSig = sig.slice(0, -1) + (sig.at(-1) === "A" ? "B" : "A");
    expect(verifyTicket(`${body}.${tamperedSig}`, ADMIN_EMAIL)).toBe(false);
  });

  it("rejects a ticket with a tampered payload (email swapped post-signing)", () => {
    const ticket = signTicket("attacker@example.com");
    const [, sig] = ticket.split(".");
    const forgedBody = Buffer.from(
      JSON.stringify({ email: ADMIN_EMAIL, iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 60 })
    ).toString("base64url");
    expect(verifyTicket(`${forgedBody}.${sig}`, ADMIN_EMAIL)).toBe(false);
  });

  it("rejects a malformed token", () => {
    expect(verifyTicket("not-a-real-token", ADMIN_EMAIL)).toBe(false);
    expect(verifyTicket("", ADMIN_EMAIL)).toBe(false);
    expect(verifyTicket("a.b.c", ADMIN_EMAIL)).toBe(false);
  });

  it("rejects an expired but validly-signed ticket", () => {
    const past = Math.floor(Date.now() / 1000) - 3600;
    const expired = signManually({ email: ADMIN_EMAIL, iat: past - 60, exp: past });
    expect(verifyTicket(expired, ADMIN_EMAIL)).toBe(false);
  });

  it("rejects a token whose payload has the wrong shape", () => {
    const malformedExp = signManually({ email: ADMIN_EMAIL, iat: 0, exp: "not-a-number" });
    const missingEmail = signManually({ iat: 0, exp: Math.floor(Date.now() / 1000) + 3600 });
    expect(verifyTicket(malformedExp, ADMIN_EMAIL)).toBe(false);
    expect(verifyTicket(missingEmail, ADMIN_EMAIL)).toBe(false);
  });
});

describe("signSessionCookie / verifySessionCookie", () => {
  it("verifies a freshly signed session cookie", () => {
    const cookie = signSessionCookie(ADMIN_EMAIL);
    expect(verifySessionCookie(cookie, ADMIN_EMAIL)).toBe(true);
  });

  it("rejects null, undefined, and empty values without throwing", () => {
    expect(verifySessionCookie(null, ADMIN_EMAIL)).toBe(false);
    expect(verifySessionCookie(undefined, ADMIN_EMAIL)).toBe(false);
    expect(verifySessionCookie("", ADMIN_EMAIL)).toBe(false);
  });

  it("rejects a session cookie for a different admin email", () => {
    const cookie = signSessionCookie("not-the-admin@example.com");
    expect(verifySessionCookie(cookie, ADMIN_EMAIL)).toBe(false);
  });

  it("rejects a session cookie signed with a different secret", () => {
    // Simulates a token forged without knowing ADMIN_SSO_SECRET.
    const body = Buffer.from(
      JSON.stringify({ email: ADMIN_EMAIL, iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 3600 })
    ).toString("base64url");
    const wrongSig = createHmac("sha256", "wrong-secret").update(body).digest("base64url");
    expect(verifySessionCookie(`${body}.${wrongSig}`, ADMIN_EMAIL)).toBe(false);
  });
});
