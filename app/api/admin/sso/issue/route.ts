import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@/lib/supabase";
import { signTicket, ADMIN_EMAIL, ADMIN_SSO_COOKIE, verifySessionCookie } from "@/lib/adminSso";

// Hardcoded allowlist — never redirect to an arbitrary `target` value.
const TARGETS: Record<string, string> = {
  visionworkx: "https://vision-workx.vercel.app",
  chorebit: "https://chorebit.vercel.app",
  feelflow: "https://feelflow-eight.vercel.app",
  mindbit: "https://mindbit-one.vercel.app",
  sanctum: "https://sanctum-web-xi.vercel.app",
  proactive: "https://proactive-zeta-three.vercel.app",
  revalor: "https://revalor-admin.vercel.app",
};

export async function GET(req: NextRequest) {
  const target = req.nextUrl.searchParams.get("target");
  const targetBase = target ? TARGETS[target] : null;
  if (!targetBase) {
    return NextResponse.redirect(new URL("/admin", req.url));
  }

  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const cookieStore = await cookies();
  const isRealAdmin = !!user && user.email === ADMIN_EMAIL;
  const isSsoAdmin = verifySessionCookie(cookieStore.get(ADMIN_SSO_COOKIE)?.value, ADMIN_EMAIL);

  if (!isRealAdmin && !isSsoAdmin) {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  const ticket = signTicket(ADMIN_EMAIL);
  return NextResponse.redirect(`${targetBase}/api/admin/sso/consume?token=${encodeURIComponent(ticket)}`);
}
