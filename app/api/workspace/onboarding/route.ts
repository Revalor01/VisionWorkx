import { NextRequest, NextResponse } from "next/server";
import { modulesConfigured, modulesServerClient, modulesServiceClient } from "@/lib/modules/supabase";
import { normalizeHost } from "@/lib/modules/domains";
import {
  alertAdminOfSignup,
  createSelfServeWorkspace,
  onboardingEmailOnce,
  selfServeEnabled,
  sendWelcome,
  TERMS_VERSION,
} from "@/lib/modules/selfServe";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

// Creates the signed-in user's self-serve workspace (one per user).
export async function POST(req: NextRequest) {
  if (!selfServeEnabled() || !modulesConfigured()) return NextResponse.json({ error: "Signups aren't open yet." }, { status: 403 });
  const origin = req.headers.get("origin");
  if (origin && origin !== req.nextUrl.origin) return NextResponse.json({ error: "Bad origin" }, { status: 403 });

  const supabase = await modulesServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) return NextResponse.json({ error: "Please sign in again." }, { status: 401 });

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  const businessName = typeof body.businessName === "string" ? body.businessName.trim().slice(0, 100) : "";
  const websiteRaw = typeof body.website === "string" ? body.website.trim().slice(0, 200) : "";
  const website = websiteRaw ? normalizeHost(websiteRaw) : null;
  const notificationEmail = typeof body.notificationEmail === "string" ? body.notificationEmail.trim().toLowerCase().slice(0, 200) : "";
  if (!businessName) return NextResponse.json({ error: "Please add your business name." }, { status: 400 });
  if (websiteRaw && !website) return NextResponse.json({ error: "That website address doesn't look right." }, { status: 400 });
  if (!EMAIL_RE.test(notificationEmail)) return NextResponse.json({ error: "Please enter a valid alert email." }, { status: 400 });
  if (body.terms !== true) return NextResponse.json({ error: "Please accept the Terms and Privacy Policy." }, { status: 400 });

  const result = await createSelfServeWorkspace({
    userId: user.id,
    email: user.email,
    businessName,
    website: website ?? "",
    notificationEmail,
  });
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: 500 });

  const db = modulesServiceClient();
  const meta = (user.user_metadata ?? {}) as Record<string, string>;
  if (!meta.terms_accepted_at) {
    await db.auth.admin.updateUserById(user.id, {
      user_metadata: { ...meta, terms_version: TERMS_VERSION, terms_accepted_at: new Date().toISOString() },
    });
  }
  const { data: ws } = await db.from("vw_workspaces").select("id").eq("slug", result.slug).single();
  if (ws) {
    await onboardingEmailOnce(ws.id, "welcome", async () => {
      await Promise.all([
        sendWelcome(user.email!, meta.full_name || businessName, result.slug),
        alertAdminOfSignup({ name: businessName, slug: result.slug, email: user.email!, website: website ?? "", builder: meta.site_builder ?? "" }),
      ]);
    });
  }
  return NextResponse.json({ slug: result.slug });
}
