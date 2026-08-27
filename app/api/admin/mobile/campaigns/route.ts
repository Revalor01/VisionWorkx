import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";
import { isAdminRequest } from "@/lib/social/adminAuth";
import { MARKETING_PRODUCT_SLUGS } from "@/lib/marketing/products";
import type { MarketingProduct } from "@/lib/database.types";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function GET() {
  if (!(await isAdminRequest())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const service = createServiceClient();
  const { data, error } = await service
    .from("marketing_campaigns")
    .select("*")
    .in("channel", ["push", "sms"])
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ campaigns: data ?? [] });
}

export async function POST(req: NextRequest) {
  if (!(await isAdminRequest())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: { product?: MarketingProduct; channel?: "push" | "sms"; title?: string; bodyText?: string };
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
  if (!body.bodyText?.trim()) {
    return NextResponse.json({ error: "bodyText is required" }, { status: 400 });
  }
  if (body.channel === "push" && !body.title?.trim()) {
    return NextResponse.json({ error: "title is required for push" }, { status: 400 });
  }

  const service = createServiceClient();
  const { data, error } = await service
    .from("marketing_campaigns")
    .insert({
      product: body.product,
      channel: body.channel,
      subject: body.channel === "push" ? body.title!.trim() : "",
      body_html: body.bodyText.trim(),
    })
    .select("*")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ campaign: data });
}
