import { createHmac, timingSafeEqual } from "crypto";

// Signs {leadId} for the unsubscribe link appended to every cold-outreach
// lead email (app/api/admin/leads/email). Same signing approach as
// lib/marketing/unsubscribeToken.ts (HMAC + timing-safe compare) and
// deliberately reuses MARKETING_UNSUBSCRIBE_SECRET rather than needing a
// new production env var — the payload shape differs ({leadId} vs
// {product, email}) so there's no cross-token ambiguity, and this is a
// generic token-signing secret, not scoped to one specific email flow.
// No expiry: a cold email might sit unread for months and the link must
// still work whenever it's clicked.

const SECRET = process.env.MARKETING_UNSUBSCRIBE_SECRET;

type TokenPayload = { leadId: string };

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

export function signLeadUnsubscribeToken(payload: TokenPayload): string {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${body}.${sign(body)}`;
}

export function verifyLeadUnsubscribeToken(token: string): TokenPayload | null {
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
    if (typeof payload.leadId !== "string") return null;
    return payload;
  } catch {
    return null;
  }
}
