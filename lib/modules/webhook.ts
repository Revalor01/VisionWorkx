import { createHmac } from "crypto";

// Outgoing webhooks: each workspace can have one HTTPS URL. The body is signed
// so the receiver can check it came from VisionWorkx:
//   X-VisionWorkx-Signature: t=<unix seconds>,v1=<hex HMAC-SHA256 of "<t>.<body>">

export function signWebhook(secret: string, body: string, timestamp = Math.floor(Date.now() / 1000)): string {
  const v1 = createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex");
  return `t=${timestamp},v1=${v1}`;
}

const PRIVATE_V4 = [/^10\./, /^127\./, /^0\./, /^169\.254\./, /^192\.168\./, /^172\.(1[6-9]|2\d|3[01])\./, /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./];

/**
 * Basic SSRF guard for owner-supplied URLs: https only, no credentials, no
 * localhost / private / link-local IP literals / internal-looking hostnames.
 * (Doesn't resolve DNS; a hostname pointing at a private IP isn't caught.)
 */
export function isSafeWebhookUrl(raw: string): boolean {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return false;
  }
  if (u.protocol !== "https:" || u.username || u.password) return false;
  const h = u.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (!h || h === "localhost" || h.endsWith(".localhost") || h.endsWith(".internal") || h.endsWith(".local")) return false;
  if (/^\d+\.\d+\.\d+\.\d+$/.test(h)) return !PRIVATE_V4.some((re) => re.test(h));
  if (h.includes(":")) return false; // IPv6 literals: not supported
  return h.includes(".");
}

export async function sendWebhook(
  url: string,
  secret: string,
  payload: unknown,
): Promise<{ status: number | null; error: string | null }> {
  if (!isSafeWebhookUrl(url)) return { status: null, error: "Webhook URL must be a public https address" };
  const body = JSON.stringify(payload);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "VisionWorkx-Webhooks/1.0",
        "X-VisionWorkx-Signature": signWebhook(secret, body),
      },
      body,
      redirect: "manual",
      signal: AbortSignal.timeout(5000),
    });
    return { status: res.status, error: res.ok ? null : `HTTP ${res.status}` };
  } catch (err) {
    return { status: null, error: err instanceof Error ? err.message.slice(0, 200) : "request failed" };
  }
}
