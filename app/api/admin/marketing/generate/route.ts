import { NextRequest, NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/social/adminAuth";
import { generateEmailCampaign } from "@/lib/marketing/emailGenerator";
import { MARKETING_PRODUCT_SLUGS, PRODUCT_LABEL } from "@/lib/marketing/products";
import type { MarketingProduct } from "@/lib/database.types";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  if (!(await isAdminRequest())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: { product?: MarketingProduct; voiceNotes?: string; goal?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body.product || !MARKETING_PRODUCT_SLUGS.includes(body.product)) {
    return NextResponse.json({ error: "Invalid or missing product" }, { status: 400 });
  }
  if (!body.goal?.trim()) {
    return NextResponse.json({ error: "goal is required — what should this email be about?" }, { status: 400 });
  }

  try {
    const email = await generateEmailCampaign({
      productLabel: PRODUCT_LABEL[body.product],
      voiceNotes: body.voiceNotes?.trim() || null,
      goal: body.goal.trim(),
    });
    return NextResponse.json(email);
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
