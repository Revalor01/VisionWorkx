import { NextRequest, NextResponse } from "next/server";
import { createServerClient, createServiceClient } from "@/lib/supabase";
import { sendOutreachBatch } from "@/lib/leads/outreach";

const ADMIN_EMAIL = "sawilliams721@gmail.com";

export async function POST(req: NextRequest) {
  const supabase = await createServerClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user || user.email !== ADMIN_EMAIL) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { leadIds?: string[]; mode?: "custom" | "generic"; subject?: string; body?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const leadIds = Array.isArray(body.leadIds) ? body.leadIds.filter((id) => typeof id === "string") : [];
  if (leadIds.length === 0) {
    return NextResponse.json({ error: "No leads selected" }, { status: 400 });
  }

  const mode = body.mode === "custom" ? "custom" : "generic";

  try {
    const service = createServiceClient();
    const result = await sendOutreachBatch(service, leadIds, mode, body.subject, body.body);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
