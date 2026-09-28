import { NextRequest, NextResponse } from "next/server";
import { modulesServerClient } from "@/lib/modules/supabase";
import { safeNextPathWithin } from "@/lib/safeRedirect";

// Magic-link / invite landing: exchange the one-time code for a session cookie.
export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  // ?next= is user-controlled: only follow it within the workspace area.
  const safeNext = safeNextPathWithin(req.nextUrl.searchParams.get("next"), "/workspace");
  if (!code) return NextResponse.redirect(new URL("/workspace/login?error=1", req.url));
  const supabase = await modulesServerClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) return NextResponse.redirect(new URL("/workspace/login?error=1", req.url));
  return NextResponse.redirect(new URL(safeNext, req.url));
}
