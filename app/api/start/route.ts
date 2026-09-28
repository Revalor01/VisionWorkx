import { NextRequest, NextResponse } from "next/server";
import { modulesConfigured, modulesServerClient, modulesServiceClient } from "@/lib/modules/supabase";
import { ipHash } from "@/lib/modules/http";
import { normalizeHost } from "@/lib/modules/domains";
import { selfServeEnabled, SITE_BUILDERS, TERMS_VERSION } from "@/lib/modules/selfServe";
import { createAccountAndSendLink } from "@/lib/modules/startSignIn";

// Self-serve signup. Supabase's own public signup stays DISABLED: accounts are
// only created here, after validation + rate limiting, via the admin API. The
// sign-in link then goes out through the normal (shouldCreateUser: false) OTP
// flow, so the email owner must click it before anything else happens.
// Accounts are created confirmed -- see lib/modules/startSignIn.ts.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function str(v: unknown, max: number): string {
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}

export async function POST(req: NextRequest) {
  if (!selfServeEnabled() || !modulesConfigured()) {
    return NextResponse.json({ error: "Signups aren't open yet — join the waitlist instead." }, { status: 403 });
  }
  const origin = req.headers.get("origin");
  if (origin && origin !== req.nextUrl.origin) return NextResponse.json({ error: "Bad origin" }, { status: 403 });

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  // Honeypot: pretend success so bots learn nothing.
  if (str(body.company_url, 200)) return NextResponse.json({ ok: true });

  const name = str(body.name, 100);
  const email = str(body.email, 200).toLowerCase();
  const businessName = str(body.businessName, 100);
  const websiteRaw = str(body.website, 200);
  const builder = SITE_BUILDERS.includes(body.builder as (typeof SITE_BUILDERS)[number]) ? (body.builder as string) : "";
  const website = websiteRaw ? normalizeHost(websiteRaw) : null;

  if (!name || !businessName) return NextResponse.json({ error: "Please add your name and business name." }, { status: 400 });
  if (!EMAIL_RE.test(email)) return NextResponse.json({ error: "Please enter a valid email address." }, { status: 400 });
  if (websiteRaw && !website) return NextResponse.json({ error: "That website address doesn't look right." }, { status: 400 });
  if (body.terms !== true) return NextResponse.json({ error: "Please accept the Terms and Privacy Policy." }, { status: 400 });

  const db = modulesServiceClient();
  const [perIp, perEmail, global] = await Promise.all([
    db.rpc("vw_rate_check", { p_key: `start:ip:${ipHash(req)}`, max_hits: 5, window_seconds: 3600 }),
    db.rpc("vw_rate_check", { p_key: `start:email:${email}`, max_hits: 3, window_seconds: 3600 }),
    db.rpc("vw_rate_check", { p_key: "start:all", max_hits: 60, window_seconds: 3600 }),
  ]);
  if (perIp.data === false || perEmail.data === false || global.data === false) {
    return NextResponse.json({ error: "Too many attempts — please try again in an hour." }, { status: 429 });
  }

  const supabase = await modulesServerClient();
  const result = await createAccountAndSendLink(
    {
      async createUser(e, metadata) {
        // Created confirmed: see lib/modules/startSignIn.ts for why that's required and safe.
        const { error } = await db.auth.admin.createUser({ email: e, email_confirm: true, user_metadata: metadata });
        if (!error) return { ok: true };
        // An existing account just gets a sign-in link; onboarding handles the rest.
        if (/already|registered|exists/i.test(error.message)) return { exists: true };
        console.error("[start] createUser failed:", error.status, error.code);
        return { error: error.code ?? error.message };
      },
      async sendLink(e) {
        const { error } = await supabase.auth.signInWithOtp({
          email: e,
          options: {
            shouldCreateUser: false,
            emailRedirectTo: `${req.nextUrl.origin}/workspace/auth/callback?next=${encodeURIComponent("/workspace/onboarding")}`,
          },
        });
        if (!error) return { ok: true };
        console.error("[start] OTP send failed:", error.status, error.code);
        return { error: error.message, code: error.code };
      },
      async confirmExisting(e) {
        // generateLink is the admin API's way to look an account up by email;
        // the link it makes is discarded (the real one goes out via sendLink).
        const { data, error } = await db.auth.admin.generateLink({ type: "magiclink", email: e });
        if (error || !data.user) {
          console.error("[start] account lookup failed:", error?.status, error?.code);
          return false;
        }
        if (data.user.email_confirmed_at) return true;
        const { error: ue } = await db.auth.admin.updateUserById(data.user.id, { email_confirm: true });
        if (ue) console.error("[start] confirming existing account failed:", ue.status, ue.code);
        return !ue;
      },
    },
    email,
    {
      full_name: name,
      business_name: businessName,
      website: website ?? "",
      site_builder: builder,
      terms_version: TERMS_VERSION,
      terms_accepted_at: new Date().toISOString(),
      signup_source: "self_serve",
    },
  );
  if ("error" in result) {
    return result.error === "create_failed"
      ? NextResponse.json({ error: "We couldn't create your account just now. Please try again." }, { status: 500 })
      : NextResponse.json({ error: "We couldn't send your sign-in link. Please try again in a minute." }, { status: 502 });
  }
  return NextResponse.json({ ok: true });
}
