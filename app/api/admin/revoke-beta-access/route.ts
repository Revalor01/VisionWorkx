import { NextRequest, NextResponse } from "next/server";
import { createServerClient, createServiceClient } from "@/lib/supabase";

const ADMIN_EMAIL = "sawilliams721@gmail.com";

export async function POST(req: NextRequest) {
  const supabase = createServerClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user || user.email !== ADMIN_EMAIL) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { userId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const userId = body.userId ?? "";
  if (!userId) {
    return NextResponse.json({ error: "Missing userId" }, { status: 400 });
  }

  const service = createServiceClient();

  // Only remove the comp subscription (no real Stripe IDs behind it) —
  // never touch a row that has a real stripe_subscription_id.
  const { data: compSub } = await service
    .from("subscriptions")
    .select("id")
    .eq("user_id", userId)
    .is("stripe_subscription_id", null)
    .maybeSingle();

  if (!compSub) {
    return NextResponse.json(
      { error: "No comp beta subscription found for this user" },
      { status: 404 }
    );
  }

  const { error: deleteError } = await service
    .from("subscriptions")
    .delete()
    .eq("id", compSub.id);

  if (deleteError) {
    console.error("[api/admin/revoke-beta-access]", deleteError.message);
    return NextResponse.json({ error: deleteError.message }, { status: 500 });
  }

  const { error: updateError } = await service
    .from("profiles")
    .update({ plan: "free" })
    .eq("id", userId);

  if (updateError) {
    console.error("[api/admin/revoke-beta-access] profile update:", updateError.message);
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
