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

  const { data: existingSub } = await service
    .from("subscriptions")
    .select("id, status")
    .eq("user_id", userId)
    .in("status", ["active", "trialing"])
    .maybeSingle();

  if (existingSub) {
    return NextResponse.json(
      { error: "This user already has an active subscription" },
      { status: 409 }
    );
  }

  // No real Stripe IDs behind this — it's a comp account purely to bypass
  // the trial-expiry and app-count gates for beta testers.
  const TEN_YEARS_MS = 10 * 365 * 24 * 60 * 60 * 1000;
  const { error: insertError } = await service.from("subscriptions").insert({
    user_id: userId,
    stripe_customer_id: null,
    stripe_subscription_id: null,
    plan: "pro",
    status: "active",
    current_period_end: new Date(Date.now() + TEN_YEARS_MS).toISOString(),
  });

  if (insertError) {
    console.error("[api/admin/grant-beta-access]", insertError.message);
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  const { error: updateError } = await service
    .from("profiles")
    .update({ plan: "pro" })
    .eq("id", userId);

  if (updateError) {
    console.error("[api/admin/grant-beta-access] profile update:", updateError.message);
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
