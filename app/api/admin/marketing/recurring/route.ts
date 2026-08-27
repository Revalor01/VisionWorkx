import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";
import { isAdminRequest } from "@/lib/social/adminAuth";
import { MARKETING_PRODUCT_SLUGS } from "@/lib/marketing/products";
import { computeNextRun } from "@/lib/marketing/recurrence";
import type { MarketingAutonomy, MarketingProduct, MarketingRecurrence } from "@/lib/database.types";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function GET() {
  if (!(await isAdminRequest())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const service = createServiceClient();
  const { data, error } = await service
    .from("marketing_recurring_schedules")
    .select("*")
    .order("next_run_at", { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ schedules: data ?? [] });
}

interface CreateBody {
  product?: MarketingProduct;
  goal?: string;
  voiceNotes?: string;
  recurrence?: MarketingRecurrence;
  dayOfWeek?: number;
  dayOfMonth?: number;
  hourUtc?: number;
  autonomy?: MarketingAutonomy;
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
  if (!body.goal?.trim()) {
    return NextResponse.json({ error: "goal is required — what should this digest be about?" }, { status: 400 });
  }
  if (body.recurrence !== "weekly" && body.recurrence !== "monthly") {
    return NextResponse.json({ error: "recurrence must be 'weekly' or 'monthly'" }, { status: 400 });
  }
  if (typeof body.hourUtc !== "number" || body.hourUtc < 0 || body.hourUtc > 23) {
    return NextResponse.json({ error: "hourUtc must be 0-23" }, { status: 400 });
  }
  const dayOfWeek = body.recurrence === "weekly" ? (body.dayOfWeek ?? null) : null;
  const dayOfMonth = body.recurrence === "monthly" ? (body.dayOfMonth ?? null) : null;
  if (body.recurrence === "weekly" && (dayOfWeek === null || dayOfWeek < 0 || dayOfWeek > 6)) {
    return NextResponse.json({ error: "dayOfWeek must be 0-6 for weekly recurrence" }, { status: 400 });
  }
  if (body.recurrence === "monthly" && (dayOfMonth === null || dayOfMonth < 1 || dayOfMonth > 31)) {
    return NextResponse.json({ error: "dayOfMonth must be 1-31 for monthly recurrence" }, { status: 400 });
  }
  const autonomy: MarketingAutonomy = body.autonomy === "auto" ? "auto" : "manual";

  const nextRunAt = computeNextRun({ recurrence: body.recurrence, dayOfWeek, dayOfMonth, hourUtc: body.hourUtc }, new Date());

  const service = createServiceClient();
  const { data, error } = await service
    .from("marketing_recurring_schedules")
    .insert({
      product: body.product,
      goal: body.goal.trim(),
      voice_notes: body.voiceNotes?.trim() || null,
      recurrence: body.recurrence,
      day_of_week: dayOfWeek,
      day_of_month: dayOfMonth,
      hour_utc: body.hourUtc,
      autonomy,
      next_run_at: nextRunAt.toISOString(),
    })
    .select("*")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ schedule: data });
}
