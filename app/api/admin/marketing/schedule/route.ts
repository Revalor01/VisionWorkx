import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";
import { isAdminRequest } from "@/lib/social/adminAuth";
import { MARKETING_PRODUCT_SLUGS } from "@/lib/marketing/products";
import type { MarketingAutonomy, MarketingChannel, MarketingProduct } from "@/lib/database.types";

export const runtime = "nodejs";
export const maxDuration = 30;

// Creates a one-off scheduled campaign for any channel (email, push, sms —
// both MarketingDashboard and MobileDashboard call this). Unlike the
// existing /api/admin/marketing/generate + /campaigns pair, this doesn't
// generate content up front — the relevant cron route (cron/email or
// cron/mobile) generates the draft when run_at comes due, so a scheduled
// campaign always reflects whatever's true about the product at send
// time, not at scheduling time.
export async function POST(req: NextRequest) {
  if (!(await isAdminRequest())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: { product?: MarketingProduct; channel?: MarketingChannel; goal?: string; voiceNotes?: string; runAt?: string; autonomy?: MarketingAutonomy };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body.product || !MARKETING_PRODUCT_SLUGS.includes(body.product)) {
    return NextResponse.json({ error: "Invalid or missing product" }, { status: 400 });
  }
  const channel: MarketingChannel = body.channel === "push" || body.channel === "sms" ? body.channel : "email";
  if (!body.goal?.trim()) {
    return NextResponse.json({ error: "goal is required — what should this message be about?" }, { status: 400 });
  }
  const runAt = body.runAt ? new Date(body.runAt) : null;
  if (!runAt || Number.isNaN(runAt.getTime()) || runAt.getTime() <= Date.now()) {
    return NextResponse.json({ error: "runAt must be a valid future date/time" }, { status: 400 });
  }
  const autonomy: MarketingAutonomy = body.autonomy === "auto" ? "auto" : "manual";

  const service = createServiceClient();
  const { data, error } = await service
    .from("marketing_campaigns")
    .insert({
      product: body.product,
      channel,
      subject: "",
      body_html: "",
      status: "scheduled",
      goal: body.goal.trim(),
      voice_notes: body.voiceNotes?.trim() || null,
      autonomy,
      run_at: runAt.toISOString(),
    })
    .select("*")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ campaign: data });
}
