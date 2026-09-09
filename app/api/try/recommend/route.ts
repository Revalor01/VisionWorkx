import { NextRequest, NextResponse } from "next/server";
import { recommendBuild } from "@/lib/apps/recommendBuild";

export const runtime = "nodejs";
export const maxDuration = 30;

// POST { businessName, businessType, description } — returns a
// BuildRecommendation the /try form pre-fills itself with. Unauthenticated
// (same as /api/try). Cheap (~$0.005/call, logged via logAiUsage); the
// expensive path (the actual build) is still email-deduped in
// createPreviewApp. A per-IP rate limit would be the next hardening step.
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
