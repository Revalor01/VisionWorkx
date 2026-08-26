import { NextRequest, NextResponse } from "next/server";
import { createServerClient, createServiceClient } from "@/lib/supabase";

export async function POST(req: NextRequest) {
  const supabase = await createServerClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { action?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const action = body.action ?? "";
  if (!action) {
    return NextResponse.json({ error: "Missing action" }, { status: 400 });
  }

  const service = createServiceClient();

  const { data: application, error: fetchError } = await service
    .from("partner_applications")
    .select("id, agreement_terms, completed_promotional_actions")
    .eq("account_user_id", user.id)
    .not("agreement_terms", "is", null)
    .maybeSingle();

  if (fetchError) {
    return NextResponse.json({ error: fetchError.message }, { status: 500 });
  }
  if (!application) {
    return NextResponse.json({ error: "No active partnership found" }, { status: 404 });
  }

  const validActions = application.agreement_terms?.requiredPromotionalActions ?? [];
  if (!validActions.includes(action)) {
    return NextResponse.json({ error: "Not a valid requirement for this partnership" }, { status: 400 });
  }

  const current = application.completed_promotional_actions ?? [];
  const next = current.includes(action)
    ? current.filter((a) => a !== action)
    : [...current, action];

  const { error: updateError } = await service
    .from("partner_applications")
    .update({ completed_promotional_actions: next, updated_at: new Date().toISOString() })
    .eq("id", application.id);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, completedPromotionalActions: next });
}
