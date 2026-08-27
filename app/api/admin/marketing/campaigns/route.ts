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
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ campaigns: data ?? [] });
}

export async function POST(req: NextRequest) {
  if (!(await isAdminRequest())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: { product?: MarketingProduct; subject?: string; bodyHtml?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body.product || !MARKETING_PRODUCT_SLUGS.includes(body.product)) {
    return NextResponse.json({ error: "Invalid or missing product" }, { status: 400 });
  }
  if (!body.subject?.trim() || !body.bodyHtml?.trim()) {
    return NextResponse.json({ error: "subject and bodyHtml are required" }, { status: 400 });
  }

  const service = createServiceClient();
  const { data, error } = await service
    .from("marketing_campaigns")
    .insert({ product: body.product, subject: body.subject.trim(), body_html: body.bodyHtml.trim() })
    .select("*")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ campaign: data });
}
