import { NextRequest, NextResponse } from "next/server";
import { createServerClient, createServiceClient } from "@/lib/supabase";
import type { Database, LeadStatus } from "@/lib/database.types";

type LeadUpdate = Database["public"]["Tables"]["leads"]["Update"];

const ADMIN_EMAIL = "sawilliams721@gmail.com";
const VALID_STATUSES: LeadStatus[] = ["new", "contacted", "responded", "qualified", "converted", "dead"];

export async function POST(req: NextRequest) {
  const supabase = createServerClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user || user.email !== ADMIN_EMAIL) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { leadId?: string; status?: string; notes?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const leadId = body.leadId ?? "";
  const status = body.status as LeadStatus;
  if (!leadId || !VALID_STATUSES.includes(status)) {
    return NextResponse.json({ error: "Missing or invalid leadId/status" }, { status: 400 });
  }

  const service = createServiceClient();

  const update: LeadUpdate = { status, updated_at: new Date().toISOString() };
  if (status === "contacted") update.last_contacted_at = new Date().toISOString();

  const { error: updateError } = await service.from("leads").update(update).eq("id", leadId);
  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  await service.from("lead_events").insert({
    lead_id: leadId,
    event_type: status,
    notes: body.notes ?? null,
  });

  return NextResponse.json({ ok: true });
}
