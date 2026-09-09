// In-memory sliding-window rate limiter. Per-Lambda-instance only —
// Vercel serverless doesn't share memory across instances or survive
// cold starts — so this blunts double-clicks and casual/scripted abuse,
// not a determined distributed attacker. Good enough for cheap,
// low-value endpoints; guard anything touching real money with a durable
// store (KV/Redis) instead.

type Bucket = number[]; // request timestamps (ms), ascending

const buckets = new Map<string, Bucket>();

export interface RateLimitResult {
  ok: boolean;
  remaining: number;
  retryAfterSec: number;
}

export function rateLimit(
  key: string,
  opts: { limit: number; windowMs: number },
): RateLimitResult {
  const now = Date.now();
  const cutoff = now - opts.windowMs;
  const hits = (buckets.get(key) ?? []).filter((t) => t > cutoff);

  if (hits.length >= opts.limit) {
    buckets.set(key, hits);
    const retryAfterSec = Math.max(1, Math.ceil((hits[0] + opts.windowMs - now) / 1000));
    return { ok: false, remaining: 0, retryAfterSec };
  }

  hits.push(now);
  buckets.set(key, hits);

  // Opportunistic sweep so the Map can't grow unbounded on a long-lived
  // instance.
  if (buckets.size > 5000) {
    for (const [k, v] of buckets) {
      const live = v.filter((t) => t > cutoff);
      if (live.length === 0) buckets.delete(k);
      else buckets.set(k, live);
    }
  }

  return { ok: true, remaining: opts.limit - hits.length, retryAfterSec: 0 };
}

// Best-effort client IP from the standard proxy headers. Vercel sets
// both at the edge; the left-most x-forwarded-for entry is the original
// client.
export function clientIp(req: Request): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  return req.headers.get("x-real-ip")?.trim() || "unknown";
}
