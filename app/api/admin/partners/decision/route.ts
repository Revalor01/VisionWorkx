import { NextRequest, NextResponse } from "next/server";
import { createServerClient, createServiceClient } from "@/lib/supabase";
import { TIER_LABELS } from "@/lib/partners/scoring";
import { sendApplicationApprovedEmail, sendApplicationDeniedEmail } from "@/lib/partners/email";
import type { PartnerStatus, PartnerTier } from "@/lib/database.types";

const ADMIN_EMAIL = "sawilliams721@gmail.com";
const VALID_DECISIONS: PartnerStatus[] = ["approved", "denied"];

export async function POST(req: NextRequest) {
  const supabase = createServerClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user || user.email !== ADMIN_EMAIL) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { applicationId?: string; decision?: string; notes?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const applicationId = body.applicationId ?? "";
  const decision = body.decision as PartnerStatus;
  if (!applicationId || !VALID_DECISIONS.includes(decision)) {
    return NextResponse.json({ error: "Missing or invalid applicationId/decision" }, { status: 400 });
  }

  const service = createServiceClient();

  const { data: application, error: fetchError } = await service
    .from("partner_applications")
    .select("business_name, email, tier, discount_percentage, status")
    .eq("id", applicationId)
    .single();

  if (fetchError || !application) {
    return NextResponse.json({ error: fetchError?.message ?? "Application not found" }, { status: 404 });
  }

  const { error: updateError } = await service
    .from("partner_applications")
    .update({
      status: decision,
      admin_notes: body.notes ?? null,
      reviewed_by: user.email,
      reviewed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", applicationId);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  if (decision === "approved") {
    const tier = (application.tier ?? "tier_3") as PartnerTier;
    await sendApplicationApprovedEmail(
      application.email,
      application.business_name,
      TIER_LABELS[tier],
      application.discount_percentage ?? 0,
    );
  } else {
    await sendApplicationDeniedEmail(application.email, application.business_name);
  }

  return NextResponse.json({ ok: true });
}
