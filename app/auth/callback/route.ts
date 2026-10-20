import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { claimPreview } from "@/lib/apps/preview";
import { safeNextPath } from "@/lib/safeRedirect";

export const runtime = "nodejs";

// Email-confirmation landing for main-app signups: exchange the one-time code
// for a session cookie, then finish what signup would have done with a live
// session — claiming a "try it first" preview (?claim=) — and continue to
// ?next=. Without this, confirming an email left the user signed out.
export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const code = params.get("code");
  // ?next= is user-controlled: only follow it to a path on this site.
  const next = safeNextPath(params.get("next"), "/dashboard");
  if (!code) return NextResponse.redirect(new URL("/login?confirm=failed", req.url));

  const supabase = await createServerClient();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);
  if (error || !data.user) {
    return NextResponse.redirect(new URL("/login?confirm=failed", req.url));
  }

  const claim = (params.get("claim") ?? "").trim();
  if (claim) {
    // Best-effort, same as the signup page's live-session path: a stale or
    // already-claimed token shouldn't block the user from their account.
    await claimPreview(claim, data.user.id).catch(() => null);
  }
  return NextResponse.redirect(new URL(next, req.url));
}
