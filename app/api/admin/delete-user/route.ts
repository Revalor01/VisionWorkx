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

  if (userId === user.id) {
    return NextResponse.json(
      { error: "Cannot delete your own admin account" },
      { status: 400 }
    );
  }

  // Deleting the auth user cascades to profiles -> apps/subscriptions.
  // This only removes the account from Vision Workx's own database — it
  // does not cancel any live Stripe subscription or tear down the user's
  // deployed Vercel projects / tenant Postgres schemas.
  const service = createServiceClient();
  const { error: deleteError } = await service.auth.admin.deleteUser(userId);

  if (deleteError) {
    console.error("[api/admin/delete-user]", deleteError.message);
    return NextResponse.json({ error: deleteError.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
