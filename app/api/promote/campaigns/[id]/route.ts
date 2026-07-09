import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import type { Database, PromoteCampaignStatus } from "@/lib/database.types";

type CampaignUpdate = Database["public"]["Tables"]["promote_campaigns"]["Update"];

const EDITABLE_STATUSES: PromoteCampaignStatus[] = ["draft", "paused", "pending_platform_approval"];

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createServerClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { status?: PromoteCampaignStatus; dailyBudget?: number; endDate?: string | null };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const update: CampaignUpdate = { updated_at: new Date().toISOString() };
  if (body.status) {
    if (!EDITABLE_STATUSES.includes(body.status) && body.status !== "completed") {
      return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    }
    update.status = body.status;
  }
  if (typeof body.dailyBudget === "number") {
    if (body.dailyBudget < 5) {
      return NextResponse.json({ error: "Daily budget must be at least $5" }, { status: 400 });
    }
    update.daily_budget = body.dailyBudget;
  }
  if (body.endDate !== undefined) update.end_date = body.endDate;

  const { data, error } = await supabase
    .from("promote_campaigns")
    .update(update)
    .eq("id", params.id)
    .select("id")
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Campaign not found" }, { status: 404 });

  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createServerClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: existing } = await supabase
    .from("promote_campaigns")
    .select("id, status")
    .eq("id", params.id)
    .maybeSingle();

  if (!existing) {
    return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
  }
  if (existing.status !== "draft") {
    return NextResponse.json({ error: "Only draft campaigns can be deleted" }, { status: 400 });
  }

  const { error } = await supabase.from("promote_campaigns").delete().eq("id", params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
