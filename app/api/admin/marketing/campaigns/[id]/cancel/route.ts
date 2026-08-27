import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";
import { isAdminRequest } from "@/lib/social/adminAuth";

export const runtime = "nodejs";
export const maxDuration = 15;

const CANCELABLE_STATUSES = ["scheduled", "generated", "pending_review"];

export async function POST(_req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  if (!(await isAdminRequest())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const service = createServiceClient();
  const { data: campaign, error: fetchError } = await service
    .from("marketing_campaigns")
    .select("status")
    .eq("id", params.id)
    .maybeSingle();
  if (fetchError) return NextResponse.json({ error: fetchError.message }, { status: 500 });
  if (!campaign) return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
  if (!CANCELABLE_STATUSES.includes(campaign.status)) {
    return NextResponse.json({ error: `Cannot cancel a campaign that's already ${campaign.status}` }, { status: 409 });
  }

  const { error } = await service
    .from("marketing_campaigns")
    .update({ status: "canceled", canceled_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("id", params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
