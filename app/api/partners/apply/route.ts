import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";
import {
  BUDGET_RANGE_OPTIONS,
  INDUSTRY_OPTIONS,
  REFERRAL_NETWORK_OPTIONS,
  scorePartnerApplication,
  SERVICES_OFFERED_OPTIONS,
  SOCIAL_REACH_OPTIONS,
} from "@/lib/partners/scoring";
import { sendApplicationReceivedEmail } from "@/lib/partners/email";
import type {
  PartnerBudgetRange,
  PartnerIndustry,
  PartnerReferralNetworkSize,
  PartnerSocialReachRange,
} from "@/lib/database.types";

// Public, unauthenticated intake route — no ADMIN_EMAIL/session check on
// purpose, this is the application form itself. Trust nothing from the
// client: every dropdown value is validated against the closed option
// sets in lib/partners/scoring.ts, and the score/tier are always computed
// here, never accepted from the request body.

const MAX_PHOTOS = 5;
const MAX_FILE_BYTES = 8 * 1024 * 1024; // matches the partner-uploads bucket's file_size_limit
const ALLOWED_MIME_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);

function isValidOption<T extends string>(value: string, options: { value: T }[]): value is T {
  return options.some((o) => o.value === value);
}

function extFromFile(file: File): string {
  const fromName = file.name.split(".").pop();
  if (fromName && fromName.length <= 5) return fromName.toLowerCase();
  if (file.type === "image/png") return "png";
  if (file.type === "image/webp") return "webp";
  return "jpg";
}

export async function POST(req: NextRequest) {
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Invalid form submission" }, { status: 400 });
  }

  // Honeypot — a field real users never see or fill in (hidden via CSS on
  // the form). Any value here means a bot filled every field blindly.
  if (String(form.get("company_fax") ?? "").trim() !== "") {
    return NextResponse.json({ ok: true, applicationId: null });
  }

  const businessName = String(form.get("business_name") ?? "").trim();
  const ownerName = String(form.get("owner_name") ?? "").trim();
  const email = String(form.get("email") ?? "").trim();
  const phone = String(form.get("phone") ?? "").trim();
  const industry = String(form.get("industry") ?? "").trim();
  const servicesOffered = form.getAll("services_offered").map((v) => String(v));
  const servicesOfferedOther = String(form.get("services_offered_other") ?? "").trim();
  const onlinePresenceUrl = String(form.get("online_presence_url") ?? "").trim();
  const budgetRange = String(form.get("budget_range") ?? "").trim();
  const socialReachRange = String(form.get("social_reach_range") ?? "").trim();
  const referralNetworkSize = String(form.get("referral_network_size") ?? "").trim();
  const whyPartner = String(form.get("why_partner") ?? "").trim();

  if (!businessName || !ownerName || !email || !phone || !whyPartner) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }
  if (!isValidOption(industry, INDUSTRY_OPTIONS)) {
    return NextResponse.json({ error: "Invalid industry" }, { status: 400 });
  }
  if (!isValidOption(budgetRange, BUDGET_RANGE_OPTIONS)) {
    return NextResponse.json({ error: "Invalid budget range" }, { status: 400 });
  }
  if (!isValidOption(socialReachRange, SOCIAL_REACH_OPTIONS)) {
    return NextResponse.json({ error: "Invalid social reach range" }, { status: 400 });
  }
  if (!isValidOption(referralNetworkSize, REFERRAL_NETWORK_OPTIONS)) {
    return NextResponse.json({ error: "Invalid referral network size" }, { status: 400 });
  }
  if (servicesOffered.length === 0 || !servicesOffered.every((s) => isValidOption(s, SERVICES_OFFERED_OPTIONS))) {
    return NextResponse.json({ error: "Select at least one valid service" }, { status: 400 });
  }

  const logoFile = form.get("logo");
  const photoFiles = form.getAll("photos").filter((f): f is File => f instanceof File && f.size > 0);

  if (photoFiles.length > MAX_PHOTOS) {
    return NextResponse.json({ error: `Upload at most ${MAX_PHOTOS} photos` }, { status: 400 });
  }
  const filesToValidate = [
    ...(logoFile instanceof File && logoFile.size > 0 ? [logoFile] : []),
    ...photoFiles,
  ];
  for (const file of filesToValidate) {
    if (!ALLOWED_MIME_TYPES.has(file.type)) {
      return NextResponse.json({ error: `Unsupported file type: ${file.type}` }, { status: 400 });
    }
    if (file.size > MAX_FILE_BYTES) {
      return NextResponse.json({ error: `${file.name} is larger than 8 MB` }, { status: 400 });
    }
  }

  const service = createServiceClient();
  const uploadPrefix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  let logoPath: string | null = null;
  if (logoFile instanceof File && logoFile.size > 0) {
    const path = `${uploadPrefix}/logo.${extFromFile(logoFile)}`;
    const { error: uploadError } = await service.storage
      .from("partner-uploads")
      .upload(path, logoFile, { contentType: logoFile.type, upsert: false });
    if (uploadError) {
      return NextResponse.json({ error: `Logo upload failed: ${uploadError.message}` }, { status: 500 });
    }
    logoPath = path;
  }

  const photoPaths: string[] = [];
  for (let i = 0; i < photoFiles.length; i++) {
    const file = photoFiles[i];
    const path = `${uploadPrefix}/photo-${i}.${extFromFile(file)}`;
    const { error: uploadError } = await service.storage
      .from("partner-uploads")
      .upload(path, file, { contentType: file.type, upsert: false });
    if (uploadError) {
      return NextResponse.json({ error: `Photo upload failed: ${uploadError.message}` }, { status: 500 });
    }
    photoPaths.push(path);
  }

  const { scoreBreakdown, totalScore, tier, discountPercentage } = scorePartnerApplication({
    industry: industry as PartnerIndustry,
    socialReachRange: socialReachRange as PartnerSocialReachRange,
    onlinePresenceUrl,
    budgetRange: budgetRange as PartnerBudgetRange,
    servicesOffered,
    referralNetworkSize: referralNetworkSize as PartnerReferralNetworkSize,
  });

  const { data: inserted, error: insertError } = await service
    .from("partner_applications")
    .insert({
      business_name: businessName,
      owner_name: ownerName,
      email,
      phone,
      industry: industry as PartnerIndustry,
      services_offered: servicesOffered,
      services_offered_other: servicesOfferedOther || null,
      online_presence_url: onlinePresenceUrl || null,
      budget_range: budgetRange as PartnerBudgetRange,
      social_reach_range: socialReachRange as PartnerSocialReachRange,
      referral_network_size: referralNetworkSize as PartnerReferralNetworkSize,
      why_partner: whyPartner,
      logo_path: logoPath,
      photo_paths: photoPaths,
      score_breakdown: scoreBreakdown,
      total_score: totalScore,
      tier,
      discount_percentage: discountPercentage,
    })
    .select("id")
    .single();

  if (insertError || !inserted) {
    return NextResponse.json({ error: insertError?.message ?? "Failed to save application" }, { status: 500 });
  }

  await sendApplicationReceivedEmail(email, businessName);

  return NextResponse.json({ ok: true, applicationId: inserted.id }, { status: 201 });
}
