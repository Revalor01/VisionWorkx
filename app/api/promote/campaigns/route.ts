import { NextRequest, NextResponse } from "next/server";
import { createServerClient, createServiceClient } from "@/lib/supabase";
import { planAllowsPlatform } from "@/lib/promote/planGates";
import { isAdmin } from "@/lib/social/authGuard";
import type { PromoteCampaignObjective, PromoteCampaignPlatform, PromoteTargetAudience } from "@/lib/database.types";

export async function GET() {
  const supabase = createServerClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: business } = await supabase
    .from("promote_businesses")
    .select("id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!business) {
    return NextResponse.json({ campaigns: [] });
  }

  const { data: campaigns, error } = await supabase
    .from("promote_campaigns")
    .select("*")
    .eq("business_id", business.id)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ campaigns: campaigns ?? [] });
}

interface CreateCampaignPayload {
  name: string;
  platform: PromoteCampaignPlatform;
  objective: PromoteCampaignObjective;
  dailyBudget: number;
  totalBudget?: number;
  startDate: string;
  endDate?: string;
  targetAudience: PromoteTargetAudience;
  creativeIds: string[];
}

export async function POST(req: NextRequest) {
  const supabase = createServerClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: CreateCampaignPayload;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body.name?.trim() || !body.platform || !body.objective || !body.dailyBudget || !body.startDate) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }
  if (body.dailyBudget < 5) {
    return NextResponse.json({ error: "Daily budget must be at least $5" }, { status: 400 });
  }
  if (!Array.isArray(body.creativeIds) || body.creativeIds.length === 0) {
    return NextResponse.json({ error: "Select at least one creative" }, { status: 400 });
  }

  const serviceClient = createServiceClient();

  const { data: business } = await serviceClient
    .from("promote_businesses")
    .select("id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!business) {
    return NextResponse.json({ error: "Complete onboarding before creating campaigns" }, { status: 404 });
  }

  const { data: sub } = await serviceClient
    .from("promote_subscriptions")
    .select("plan, status")
    .eq("user_id", user.id)
    .maybeSingle();

  const activePlan = isAdmin(user)
    ? "pro"
    : sub?.status === "active" || sub?.status === "trialing"
      ? sub.plan
      : null;
  if (!planAllowsPlatform(activePlan, body.platform)) {
    return NextResponse.json(
      { error: "PLAN_LIMIT", upgrade: true, message: "Your plan doesn't include this platform" },
      { status: 403 }
    );
  }

  const { data: campaign, error: campaignError } = await serviceClient
    .from("promote_campaigns")
    .insert({
      business_id: business.id,
      name: body.name.trim(),
      platform: body.platform,
      objective: body.objective,
      status: "draft",
      daily_budget: body.dailyBudget,
      total_budget: body.totalBudget ?? null,
      start_date: body.startDate,
      end_date: body.endDate ?? null,
      target_audience: body.targetAudience,
    })
    .select("id")
    .single();

  if (campaignError) {
    return NextResponse.json({ error: campaignError.message }, { status: 500 });
  }

  const joinRows = body.creativeIds.map((creativeId) => ({ campaign_id: campaign.id, creative_id: creativeId }));
  const { error: joinError } = await serviceClient.from("promote_campaign_creatives").insert(joinRows);

  if (joinError) {
    console.error("[campaigns POST] join insert failed:", joinError.message);
  }

  return NextResponse.json({ campaignId: campaign.id }, { status: 201 });
}
