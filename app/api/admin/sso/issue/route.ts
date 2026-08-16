import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { signTicket, ADMIN_EMAIL } from "@/lib/adminSso";

// Hardcoded allowlist — never redirect to an arbitrary `target` value.
const TARGETS: Record<string, string> = {
  visionworkx: "https://vision-workx.vercel.app",
  chorebit: "https://chorebit.vercel.app",
  feelflow: "https://feelflow-eight.vercel.app",
  mindbit: "https://mindbit-one.vercel.app",
  sanctum: "https://sanctum-web-xi.vercel.app",
  revalor: "https://revalor-admin.vercel.app",
};

export async function GET(req: NextRequest) {
  const target = req.nextUrl.searchParams.get("target");
  const targetBase = target ? TARGETS[target] : null;
  if (!targetBase) {
    return NextResponse.redirect(new URL("/admin", req.url));
  }

  const supabase = createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || user.email !== ADMIN_EMAIL) {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  const ticket = signTicket(ADMIN_EMAIL);
  return NextResponse.redirect(`${targetBase}/api/admin/sso/consume?token=${encodeURIComponent(ticket)}`);
}
