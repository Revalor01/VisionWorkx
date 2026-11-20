import { NextRequest, NextResponse } from "next/server";
import { createServerClient, createServiceClient } from "@/lib/supabase";
import { isAdmin } from "@/lib/social/authGuard";
import { automationActive, isCadence, loadAutomation } from "@/lib/social/linkedinAutomation";

// LinkedIn automation controls (on/pause, cadence, end date) for
// /admin/social -> LinkedIn. Admin-only. See lib/social/linkedinAutomation.ts.

async function requireAdmin() {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return isAdmin(user);
}

export async function GET() {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const settings = await loadAutomation(createServiceClient());
  return NextResponse.json({ settings, active: automationActive(settings, Date.now()) });
}

export async function PUT(req: NextRequest) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  let body: { enabled?: unknown; cadence?: unknown; endsAt?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const update: { enabled?: boolean; cadence?: string; ends_at?: string | null; updated_at: string } = {
    updated_at: new Date().toISOString(),
  };
  if (body.enabled !== undefined) {
    if (typeof body.enabled !== "boolean") return NextResponse.json({ error: "enabled must be true or false" }, { status: 400 });
    update.enabled = body.enabled;
  }
  if (body.cadence !== undefined) {
    if (!isCadence(body.cadence)) return NextResponse.json({ error: "Unknown cadence" }, { status: 400 });
    update.cadence = body.cadence;
  }
  if (body.endsAt !== undefined) {
    if (body.endsAt === null) update.ends_at = null;
    else if (typeof body.endsAt === "string" && !Number.isNaN(Date.parse(body.endsAt))) update.ends_at = new Date(body.endsAt).toISOString();
    else return NextResponse.json({ error: "endsAt must be a date or null" }, { status: 400 });
  }

  const service = createServiceClient();
  const { error } = await service.from("linkedin_automation").upsert({ id: 1, ...update }, { onConflict: "id" });
  if (error) {
    console.error("[linkedin automation] save failed:", error.message);
    return NextResponse.json({ error: "Couldn't save the automation settings" }, { status: 500 });
  }
  const settings = await loadAutomation(service);
  return NextResponse.json({ settings, active: automationActive(settings, Date.now()) });
}
