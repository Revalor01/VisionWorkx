import { createHmac, timingSafeEqual } from "crypto";
import type { MarketingProduct } from "@/lib/database.types";

// Signs {product, email} pairs for the unsubscribe link appended to every
// campaign email. Deliberately a separate secret from ADMIN_SSO_SECRET
// (lib/adminSso.ts) — this token gets handed to end-users in email links,
// a different trust boundary than admin identity. No expiry: an email
// sent today might sit unread for months and the link must still work.

const SECRET = process.env.MARKETING_UNSUBSCRIBE_SECRET;

type TokenPayload = { product: MarketingProduct; email: string };

function sign(body: string): string {
  if (!SECRET) throw new Error("MARKETING_UNSUBSCRIBE_SECRET is not configured");
  return createHmac("sha256", SECRET).update(body).digest("base64url");
}

function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

export function signUnsubscribeToken(payload: TokenPayload): string {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${body}.${sign(body)}`;
}

export function verifyUnsubscribeToken(token: string): TokenPayload | null {
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
    if (typeof payload.email !== "string" || typeof payload.product !== "string") return null;
    return payload;
  } catch {
    return null;
  }
}
