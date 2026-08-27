import { createHmac, timingSafeEqual } from "crypto";

// Twilio's webhook auth: HMAC-SHA1 of the exact request URL with each POST
// param's key+value appended (sorted by key), base64-encoded, compared to
// the X-Twilio-Signature header. https://www.twilio.com/docs/usage/webhooks/webhooks-security
// This gates both mobile SMS webhooks — public endpoints, one of which
// writes real opt-out compliance data, so an unverified request being
// trusted isn't just noise.
export function verifyTwilioSignature(params: { url: string; body: Record<string, string>; signature: string | null; authToken: string }): boolean {
  const { url, body, signature, authToken } = params;
  if (!signature) return false;

  const data = Object.keys(body)
    .sort()
    .reduce((acc, key) => acc + key + body[key], url);

  const expected = createHmac("sha1", authToken).update(data, "utf8").digest("base64");

  const expectedBuf = Buffer.from(expected);
  const signatureBuf = Buffer.from(signature);
  if (expectedBuf.length !== signatureBuf.length) return false;
  return timingSafeEqual(expectedBuf, signatureBuf);
}
