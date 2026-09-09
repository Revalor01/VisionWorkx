import { NextRequest, NextResponse } from "next/server";
import { recommendBuild } from "@/lib/apps/recommendBuild";
import { rateLimit, clientIp } from "@/lib/rateLimit";

export const runtime = "nodejs";
export const maxDuration = 30;

// POST { businessName, businessType, description } — returns a
// BuildRecommendation the /try form pre-fills itself with. Unauthenticated
// (same as /api/try). Cheap (~$0.005/call, logged via logAiUsage); the
// expensive path (the actual build) is still email-deduped in
// createPreviewApp.
//
// Rate limited per-IP (8 / 10 min) with a per-instance global cap as a
// circuit breaker. In-memory — see lib/rateLimit.ts for what that does
// and doesn't cover.
const PER_IP = { limit: 8, windowMs: 10 * 60_000 };
const GLOBAL = { limit: 150, windowMs: 10 * 60_000 };

export async function POST(req: NextRequest) {
  let body: { businessName?: string; businessType?: string; description?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const businessName = (body.businessName ?? "").trim().slice(0, 120);
  const businessType = (body.businessType ?? "").trim().slice(0, 120);
  const description = (body.description ?? "").trim().slice(0, 800);

  if (!businessType || description.length < 10) {
    return NextResponse.json(
      { error: "Add your business type and a sentence about what you need." },
      { status: 400 },
    );
  }

  // Only count requests that would actually make the (paid) Claude call.
  const ip = clientIp(req);
  const perIp = rateLimit(`try_recommend:${ip}`, PER_IP);
  if (!perIp.ok) {
    return NextResponse.json(
      { error: "You've tried a few of these — give it a minute and try again." },
      { status: 429, headers: { "Retry-After": String(perIp.retryAfterSec) } },
    );
  }
  const global = rateLimit("try_recommend:global", GLOBAL);
  if (!global.ok) {
    return NextResponse.json(
      { error: "We're getting a lot of requests right now — try again shortly." },
      { status: 429, headers: { "Retry-After": String(global.retryAfterSec) } },
    );
  }

  try {
    const rec = await recommendBuild({ businessName, businessType, description });
    return NextResponse.json(rec);
  } catch (err) {
    console.error("[api/try/recommend] failed:", err);
    return NextResponse.json(
      { error: "Couldn't generate a recommendation — pick your app type below." },
      { status: 500 },
    );
  }
}
