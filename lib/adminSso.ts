import { createHmac, timingSafeEqual } from "crypto";

// Cross-app admin SSO: a short-lived signed "ticket" hands the admin's
// identity from one Revalor app to another (each app has its own separate
// Supabase auth pool, so there's no native shared session), then the target
// app mints its own longer-lived signed cookie. Both are HMAC-SHA256 over
// ADMIN_SSO_SECRET, which must be identical across all four apps.

const SECRET = process.env.ADMIN_SSO_SECRET;
const TICKET_TTL_SECONDS = 60;
const SESSION_TTL_SECONDS = 60 * 60 * 12;

export const ADMIN_SSO_COOKIE = "admin_sso";

// Mirrors the same hardcoded-email constant already inlined in
// app/admin/page.tsx and lib/social/authGuard.ts.
export const ADMIN_EMAIL = "sawilliams721@gmail.com";

type TokenPayload = { email: string; iat: number; exp: number };

function sign(body: string): string {
  if (!SECRET) throw new Error("ADMIN_SSO_SECRET is not configured");
  return createHmac("sha256", SECRET).update(body).digest("base64url");
}

function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

function encodeToken(payload: TokenPayload): string {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${body}.${sign(body)}`;
}

function decodeToken(token: string): TokenPayload | null {
  if (!SECRET) return null;
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;

  let expectedSig: string;
  try {
    expectedSig = sign(body);
  } catch {
    return null;
  }
  if (!safeEqual(sig, expectedSig)) return null;

  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as TokenPayload;
    if (typeof payload.email !== "string" || typeof payload.exp !== "number") return null;
    if (Math.floor(Date.now() / 1000) > payload.exp) return null;
    return payload;
  } catch {
    return null;
  }
}

export function signTicket(email: string): string {
  const now = Math.floor(Date.now() / 1000);
  return encodeToken({ email, iat: now, exp: now + TICKET_TTL_SECONDS });
}

export function verifyTicket(token: string, adminEmail: string): boolean {
  const payload = decodeToken(token);
  return !!payload && payload.email.toLowerCase() === adminEmail.toLowerCase();
}

export function signSessionCookie(email: string): string {
  const now = Math.floor(Date.now() / 1000);
  return encodeToken({ email, iat: now, exp: now + SESSION_TTL_SECONDS });
}

export function verifySessionCookie(value: string | null | undefined, adminEmail: string): boolean {
  if (!value) return false;
  const payload = decodeToken(value);
  return !!payload && payload.email.toLowerCase() === adminEmail.toLowerCase();
}
