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
