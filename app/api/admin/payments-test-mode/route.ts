import { NextRequest, NextResponse } from "next/server";
import { createServerClient, createServiceClient } from "@/lib/supabase";

export const runtime = "nodejs";

const ADMIN_EMAIL = "sawilliams721@gmail.com";

// POST { appId, enabled } — flip an app's Stripe Connect test mode. Turning
// it on/off also resets the connected-account fields so onboarding starts
// fresh in the new mode (a live acct id can't be used with the test key).
export async function POST(req: NextRequest) {
  const supabase = await createServerClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user || user.email !== ADMIN_EMAIL) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { appId?: string; enabled?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const appId = body.appId ?? "";
  const enabled = body.enabled === true;
  if (!appId) return NextResponse.json({ error: "Missing appId" }, { status: 400 });

  const service = createServiceClient();
  const { error } = await service
    .from("apps")
    .update({
      payments_test_mode: enabled,
      stripe_connect_account_id: null,
      payments_status: "none",
    })
    .eq("id", appId);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, payments_test_mode: enabled });
}
