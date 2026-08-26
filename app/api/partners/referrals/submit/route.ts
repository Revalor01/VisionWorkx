import { NextRequest, NextResponse } from "next/server";
import { createServerClient, createServiceClient } from "@/lib/supabase";
import { sendReferralSubmittedEmail } from "@/lib/partners/email";

export async function POST(req: NextRequest) {
  const supabase = await createServerClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: {
    referredBusinessName?: string;
    referredContactName?: string;
    referredEmail?: string;
    referredPhone?: string;
    notes?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const referredBusinessName = (body.referredBusinessName ?? "").trim();
  if (!referredBusinessName) {
    return NextResponse.json({ error: "Referred business name is required" }, { status: 400 });
  }

  const service = createServiceClient();

  const { data: application, error: fetchError } = await service
    .from("partner_applications")
    .select("id, business_name")
    .eq("account_user_id", user.id)
    .not("agreement_accepted_at", "is", null)
    .maybeSingle();

  if (fetchError) {
    return NextResponse.json({ error: fetchError.message }, { status: 500 });
  }
  if (!application) {
    return NextResponse.json({ error: "No active partnership found" }, { status: 404 });
  }

  const { error: insertError } = await service.from("partner_referrals").insert({
    partner_application_id: application.id,
    referred_business_name: referredBusinessName,
    referred_contact_name: body.referredContactName?.trim() || null,
    referred_email: body.referredEmail?.trim() || null,
    referred_phone: body.referredPhone?.trim() || null,
    notes: body.notes?.trim() || null,
  });

  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  await sendReferralSubmittedEmail(application.business_name, referredBusinessName);

  return NextResponse.json({ ok: true }, { status: 201 });
}
