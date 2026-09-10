import { NextRequest, NextResponse } from "next/server";
import { createServerClient, createServiceClient } from "@/lib/supabase";
import type { IntakeData } from "@/lib/database.types";

const CATEGORY_LABEL: Record<string, string> = {
  booking: "Booking App",
  crm: "CRM",
  inventory: "Inventory App",
  portal: "Customer Portal",
  invoicing: "Invoicing App",
  membership: "Membership App",
  storefront: "Online Store",
};

// Add-on categories, deduped, primary removed, capped at 2. Past two, the
// generation runs longer than the function limit and the build times out.
const MAX_SECONDARY = 2;
function capSecondary(intake: IntakeData) {
  return [...new Set(intake.secondaryCategories ?? [])]
    .filter((c) => c !== intake.category)
    .slice(0, MAX_SECONDARY);
}

export async function POST(req: NextRequest) {
  const supabase = await createServerClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let intake: IntakeData;
  try {
    intake = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  // Cap add-on categories at 2 — more than that and generation runs past
  // the function time limit and the build times out.
  intake.secondaryCategories = capSecondary(intake);

  const appName = `${intake.businessName} ${CATEGORY_LABEL[intake.category] ?? intake.category}`;

  const serviceClient = createServiceClient();
  const { data: app, error: insertError } = await serviceClient
    .from("apps")
    .insert({
      user_id: user.id,
      name: appName,
      category: intake.category,
      secondary_categories: intake.secondaryCategories ?? [],
      status: "generating",
      intake_data: intake,
    })
    .select("id")
    .single();

  if (insertError) {
    console.error("[api/apps] insert error:", insertError.message);
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  return NextResponse.json({ appId: app.id }, { status: 201 });
}

export async function PATCH(req: NextRequest) {
  const supabase = await createServerClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { appId?: string; intake?: IntakeData };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const appId = body.appId ?? "";
  const intake = body.intake;
  if (!appId || !intake) {
    return NextResponse.json({ error: "Missing appId or intake" }, { status: 400 });
  }
  intake.secondaryCategories = capSecondary(intake);

  const serviceClient = createServiceClient();

  // Ownership check — only the owner can edit their app.
  const { data: existing } = await serviceClient
    .from("apps")
    .select("id, user_id")
    .eq("id", appId)
    .single();

  if (!existing || existing.user_id !== user.id) {
    return NextResponse.json({ error: "App not found" }, { status: 404 });
  }

  const appName = `${intake.businessName} ${CATEGORY_LABEL[intake.category] ?? intake.category}`;

  const { error: updateError } = await serviceClient
    .from("apps")
    .update({
      name: appName,
      category: intake.category,
      secondary_categories: intake.secondaryCategories ?? [],
      intake_data: intake,
      status: "generating",
      generated_code: null,
      deploy_url: null,
    })
    .eq("id", appId);

  if (updateError) {
    console.error("[api/apps] update error:", updateError.message);
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  return NextResponse.json({ appId }, { status: 200 });
}
