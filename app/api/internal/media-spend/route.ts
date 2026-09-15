import { NextRequest, NextResponse } from "next/server";
import { getMediaGenerationSpend } from "@/lib/social/gatewaySpend";

// Lets revalor-admin's /costs page pull real social-media image/video
// generation spend (lib/social/gatewaySpend.ts - Vercel AI Gateway's own
// spend report, filtered to the flux-2-pro/kling-v2.6-t2v models) without
// duplicating that logic. Not session-gated - revalor-admin's server has no
// browser session here - protected by MEDIA_SPEND_SECRET bearer token
// instead, same pattern as DEV_LOG_SECRET/CLAUDE_USAGE_SECRET.

function isAuthorized(req: NextRequest): boolean {
  const secret = process.env.MEDIA_SPEND_SECRET;
  if (!secret) return false;
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.replace(/^Bearer\s+/i, "");
  return token === secret;
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const days = Math.min(Number(req.nextUrl.searchParams.get("days") ?? "30") || 30, 365);

  try {
    const summary = await getMediaGenerationSpend(days);
    return NextResponse.json({ ok: true, summary });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
