import { NextRequest, NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/social/adminAuth";
import { generatePushCampaign, generateSmsCampaign } from "@/lib/mobile/generator";
import { PRODUCT_LABEL, MARKETING_PRODUCT_SLUGS } from "@/lib/marketing/products";
import type { MarketingProduct } from "@/lib/database.types";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  if (!(await isAdminRequest())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: { product?: MarketingProduct; channel?: "push" | "sms"; goal?: string; voiceNotes?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body.product || !MARKETING_PRODUCT_SLUGS.includes(body.product)) {
    return NextResponse.json({ error: "Invalid or missing product" }, { status: 400 });
  }
  if (body.channel !== "push" && body.channel !== "sms") {
    return NextResponse.json({ error: "channel must be push or sms" }, { status: 400 });
  }
  if (!body.goal?.trim()) {
    return NextResponse.json({ error: "goal is required — what should this message be about?" }, { status: 400 });
  }

  try {
    const productLabel = PRODUCT_LABEL[body.product];
    const voiceNotes = body.voiceNotes?.trim() || null;
    const goal = body.goal.trim();

    if (body.channel === "push") {
      return NextResponse.json(await generatePushCampaign({ productLabel, voiceNotes, goal }));
    }
    return NextResponse.json(await generateSmsCampaign({ productLabel, voiceNotes, goal }));
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
