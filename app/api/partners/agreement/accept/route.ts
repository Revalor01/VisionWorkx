import { NextResponse } from "next/server";
import { createServerClient, createServiceClient } from "@/lib/supabase";
import { TIER_LABELS } from "@/lib/partners/scoring";
import { generateReferralCode } from "@/lib/partners/referrals";
import { sendAgreementAcceptedEmail } from "@/lib/partners/email";
import type { PartnerTier } from "@/lib/database.types";

const REFERRAL_CODE_ATTEMPTS = 3;

export async function POST() {
  const supabase = await createServerClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const service = createServiceClient();

  const { data: application, error: fetchError } = await service
    .from("partner_applications")
    .select("id, business_name, tier, agreement_terms, agreement_accepted_at")
    .eq("account_user_id", user.id)
    .not("agreement_terms", "is", null)
    .is("agreement_accepted_at", null)
    .maybeSingle();

  if (fetchError) {
    return NextResponse.json({ error: fetchError.message }, { status: 500 });
  }
  if (!application) {
    return NextResponse.json({ error: "No pending agreement found" }, { status: 404 });
  }

  const now = new Date().toISOString();

  let updateError: { message: string } | null = null;
  for (let attempt = 0; attempt < REFERRAL_CODE_ATTEMPTS; attempt++) {
    const { error } = await service
      .from("partner_applications")
      .update({ agreement_accepted_at: now, updated_at: now, referral_code: generateReferralCode() })
      .eq("id", application.id);
    updateError = error;
    if (!error || error.code !== "23505") break; // 23505 = unique_violation, retry with a new code
  }

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  const tier = (application.tier ?? "tier_3") as PartnerTier;
  await sendAgreementAcceptedEmail(application.business_name, TIER_LABELS[tier]);

  return NextResponse.json({ ok: true });
}
