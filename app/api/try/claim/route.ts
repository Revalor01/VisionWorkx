import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { claimPreview } from "@/lib/apps/preview";

export const runtime = "nodejs";

// POST { token } — a freshly signed-up user claims a preview as their own.
export async function POST(req: NextRequest) {
  const supabase = await createServerClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { token?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const token = (body.token ?? "").trim();
  if (!token) {
    return NextResponse.json({ error: "Missing token" }, { status: 400 });
  }

  const result = await claimPreview(token, user.id);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 409 });
  }
  return NextResponse.json({ appId: result.appId });
}
