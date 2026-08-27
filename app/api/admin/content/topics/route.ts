import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";
import { isAdminRequest } from "@/lib/social/adminAuth";
import { MARKETING_PRODUCT_SLUGS } from "@/lib/marketing/products";
import { computeNextRun } from "@/lib/marketing/recurrence";
import type { ContentTopicCadence, MarketingProduct } from "@/lib/database.types";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function GET() {
  if (!(await isAdminRequest())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const service = createServiceClient();
  const { data, error } = await service.from("content_topics").select("*").order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ topics: data ?? [] });
}

interface CreateBody {
  product?: MarketingProduct;
  topic?: string;
  keywordCluster?: string[];
  cadence?: ContentTopicCadence;
  dayOfWeek?: number;
  dayOfMonth?: number;
  hourUtc?: number;
  socialBrandId?: string;
}

export async function POST(req: NextRequest) {
  if (!(await isAdminRequest())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: CreateBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body.product || !MARKETING_PRODUCT_SLUGS.includes(body.product)) {
    return NextResponse.json({ error: "Invalid or missing product" }, { status: 400 });
  }
  if (!body.topic?.trim()) {
    return NextResponse.json({ error: "topic is required" }, { status: 400 });
  }
  const cadence: ContentTopicCadence = body.cadence === "weekly" || body.cadence === "monthly" ? body.cadence : "on_demand";
  const hourUtc = typeof body.hourUtc === "number" && body.hourUtc >= 0 && body.hourUtc <= 23 ? body.hourUtc : 13;

  let nextRunAt: string | null = null;
  if (cadence !== "on_demand") {
    const dayOfWeek = cadence === "weekly" ? (body.dayOfWeek ?? 1) : null;
    const dayOfMonth = cadence === "monthly" ? (body.dayOfMonth ?? 1) : null;
    nextRunAt = computeNextRun({ recurrence: cadence, dayOfWeek, dayOfMonth, hourUtc }, new Date()).toISOString();
  }

  const service = createServiceClient();
  const { data, error } = await service
    .from("content_topics")
    .insert({
      product: body.product,
      topic: body.topic.trim(),
      keyword_cluster: body.keywordCluster ?? [],
      cadence,
      day_of_week: cadence === "weekly" ? (body.dayOfWeek ?? 1) : null,
      day_of_month: cadence === "monthly" ? (body.dayOfMonth ?? 1) : null,
      hour_utc: hourUtc,
      social_brand_id: body.socialBrandId || null,
      next_run_at: nextRunAt,
    })
    .select("*")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ topic: data });
}
