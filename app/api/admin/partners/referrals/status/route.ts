import { NextRequest, NextResponse } from "next/server";
import { createServerClient, createServiceClient } from "@/lib/supabase";
import { recalculateReferralBonus } from "@/lib/partners/referrals";
import type { PartnerReferralStatus } from "@/lib/database.types";

const ADMIN_EMAIL = "sawilliams721@gmail.com";
const VALID_STATUSES: PartnerReferralStatus[] = ["submitted", "contacted", "converted", "declined"];

export async function POST(req: NextRequest) {
  const supabase = createServerClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user || user.email !== ADMIN_EMAIL) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { referralId?: string; status?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const referralId = body.referralId ?? "";
  const status = body.status as PartnerReferralStatus;
  if (!referralId || !VALID_STATUSES.includes(status)) {
    return NextResponse.json({ error: "Missing or invalid referralId/status" }, { status: 400 });
  }

  const service = createServiceClient();

  const { data: referral, error: fetchError } = await service
    .from("partner_referrals")
    .select("id, partner_application_id")
    .eq("id", referralId)
    .single();

  if (fetchError || !referral) {
    return NextResponse.json({ error: fetchError?.message ?? "Referral not found" }, { status: 404 });
  }

  const { error: updateError } = await service
    .from("partner_referrals")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", referralId);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  await recalculateReferralBonus(service, referral.partner_application_id);

  return NextResponse.json({ ok: true });
}
