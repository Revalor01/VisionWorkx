import { NextRequest, NextResponse } from "next/server";
import { createServerClient, createServiceClient } from "@/lib/supabase";
import type { IntakeData } from "@/lib/database.types";

const CATEGORY_LABEL: Record<string, string> = {
  booking: "Booking App",
  crm: "CRM",
  inventory: "Inventory App",
  portal: "Customer Portal",
};

export async function POST(req: NextRequest) {
  const supabase = createServerClient();
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

  const appName = `${intake.businessName} ${CATEGORY_LABEL[intake.category] ?? intake.category}`;

  const serviceClient = createServiceClient();
  const { data: app, error: insertError } = await serviceClient
    .from("apps")
    .insert({
      user_id: user.id,
      name: appName,
      category: intake.category,
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
  const supabase = createServerClient();
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
