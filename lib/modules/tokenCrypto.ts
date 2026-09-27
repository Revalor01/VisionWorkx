import { createCipheriv, createDecipheriv, createHmac, randomBytes, timingSafeEqual } from "crypto";

// Encryption for third-party credentials stored in the modules database
// (Google Calendar refresh tokens). AES-256-GCM with a random IV; the key is
// CALENDAR_TOKEN_KEY (32 random bytes, base64). Format: v1.<iv>.<tag>.<data>,
// all base64url. Server-only.

function key(): Buffer {
  const raw = process.env.CALENDAR_TOKEN_KEY;
  if (!raw) throw new Error("CALENDAR_TOKEN_KEY is not set");
  const k = Buffer.from(raw, "base64");
  if (k.length !== 32) throw new Error("CALENDAR_TOKEN_KEY must be 32 bytes, base64-encoded");
  return k;
}

export function encryptToken(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), data.toString("base64url")].join(".");
}

export function decryptToken(stored: string): string {
  const [v, iv, tag, data] = stored.split(".");
  if (v !== "v1" || !iv || !tag || !data) throw new Error("Unrecognised token format");
  const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(data, "base64url")), decipher.final()]).toString("utf8");
}

/** HMAC-signs a small payload (OAuth `state`) with a key derived from CALENDAR_TOKEN_KEY. */
export function signState(payload: object): string {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${body}.${mac(body)}`;
}

/** The payload if the signature checks out, else null. */
export function verifyState<T>(state: string): T | null {
  const [body, sig] = state.split(".");
  if (!body || !sig) return null;
  const want = Buffer.from(mac(body));
  const got = Buffer.from(sig);
  if (want.length !== got.length || !timingSafeEqual(want, got)) return null;
  try {
    return JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as T;
  } catch {
    return null;
  }
}

function mac(body: string): string {
  return createHmac("sha256", key()).update(`vw-oauth-state:${body}`).digest("base64url");
}
