import { modulesServiceClient } from "./supabase";
import { normalizeDomainList } from "./domains";

// Self-serve signup (modules.revalorllc.com/start). OFF unless
// SELF_SERVE_SIGNUP=true — a missing env var never opens signups.
export function selfServeEnabled(): boolean {
  return process.env.SELF_SERVE_SIGNUP === "true";
}

export const TERMS_VERSION = "2026-09-draft";
export const SITE_BUILDERS = ["WordPress", "Squarespace", "Wix", "Webflow", "Framer", "Shopify", "Other", "No website yet"] as const;

const RESERVED = new Set(["admin", "api", "app", "billing", "login", "signup", "start", "support", "www", "revalor", "visionworkx", "workspace", "help", "settings", "onboarding"]);

export function slugBase(name: string): string {
  const s = name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .replace(/-+$/g, "");
  const base = s.length >= 3 ? s : `${s || "biz"}-co`.slice(0, 40);
  return RESERVED.has(base) ? `${base}-co` : base;
}

/** Domains a workspace may run forms on: the site's host plus its www twin. */
export function domainsFromWebsite(website: string): string[] {
  const hosts = normalizeDomainList([website]);
  const out = new Set<string>();
  for (const h of hosts) {
    out.add(h);
    if (h !== "localhost") out.add(h.startsWith("www.") ? h.slice(4) : `www.${h}`);
  }
  return [...out].slice(0, 20);
}

export interface NewWorkspaceInput {
  userId: string;
  email: string;
  businessName: string;
  website: string;
  notificationEmail: string;
}

/** Creates the owner's self-serve workspace. Returns its slug, or an error for the user. */
export async function createSelfServeWorkspace(input: NewWorkspaceInput): Promise<{ slug: string } | { error: string }> {
  const db = modulesServiceClient();
  const { data: existing } = await db.from("vw_workspaces").select("slug").eq("created_by", input.userId).eq("self_serve", true).maybeSingle();
  if (existing) return { slug: existing.slug };

  const base = slugBase(input.businessName);
  for (let i = 0; i < 6; i++) {
    const slug = i === 0 ? base : `${base.slice(0, 40)}-${Math.random().toString(36).slice(2, 6)}`;
    const { data, error } = await db
      .from("vw_workspaces")
      .insert({
        name: input.businessName,
        slug,
        domains: domainsFromWebsite(input.website),
        notification_email: input.notificationEmail,
        plan: "starter",
        billing_status: "none",
        self_serve: true,
        created_by: input.userId,
      })
      .select("id, slug")
      .single();
    if (error) {
      if (error.code === "23505" && /one_self_serve/.test(error.message)) {
        const { data: again } = await db.from("vw_workspaces").select("slug").eq("created_by", input.userId).eq("self_serve", true).maybeSingle();
        if (again) return { slug: again.slug };
      }
      if (error.code === "23505") continue; // slug taken — try a suffixed one
      console.error("[self-serve] workspace insert failed:", error.code, error.message);
      return { error: "We couldn't set up your workspace. Please try again." };
    }
    const { error: mErr } = await db.from("vw_workspace_members").insert({ workspace_id: data.id, user_id: input.userId, role: "owner" });
    if (mErr) {
      console.error("[self-serve] owner membership failed:", mErr.code);
      return { error: "We couldn't finish setting up your workspace. Please try again." };
    }
    return { slug: data.slug };
  }
  return { error: "That business name is taken many times over — try adding your town or trade." };
}

async function send(to: string, subject: string, text: string) {
  const key = process.env.RESEND_API_KEY;
  if (!key || !to) return;
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: "VisionWorkx <notifications@notify.revalorllc.com>", to: [to], subject, text }),
  });
  if (!res.ok) console.error("[self-serve] email failed:", res.status);
}

// Onboarding emails are once per workspace EVER, so they share a fixed period
// key instead of the month used by usage alerts.
const ONCE_PERIOD = "0000-00";

/** Once-per-workspace onboarding email (deduped in vw_usage_alerts). */
export async function onboardingEmailOnce(workspaceId: string, kind: "welcome" | "install_nudge" | "install_request", fn: () => Promise<void>) {
  const { error } = await modulesServiceClient().from("vw_usage_alerts").insert({ workspace_id: workspaceId, period: ONCE_PERIOD, kind });
  if (!error) await fn();
}

export async function sendWelcome(to: string, name: string, slug: string) {
  const base = `https://modules.revalorllc.com/workspace/${slug}`;
  await send(
    to,
    "Welcome to VisionWorkx — here's how to get your first form live",
    `Hi ${name},\n\nYour VisionWorkx workspace is ready. Three steps to your first live form:\n\n1. Start your 14-day free trial: ${base}/billing\n2. Describe your form in a sentence and publish it: ${base}/modules/new\n3. Paste one line into your website (step-by-step for your site builder): ${base}/modules\n\nRather not touch your website? Use "Have Revalor install it" in your workspace and we'll do it for you.\n\n— The VisionWorkx team at Revalor`,
  );
}

export async function alertAdminOfSignup(ws: { name: string; slug: string; email: string; website: string; builder: string }) {
  await send(
    process.env.VW_SIGNUP_ALERT_EMAIL || "admin@revalorllc.com",
    `New VisionWorkx signup: ${ws.name}`,
    `A new business just created a VisionWorkx workspace.\n\nBusiness: ${ws.name}\nOwner: ${ws.email}\nWebsite: ${ws.website || "(none)"}\nSite builder: ${ws.builder || "(not given)"}\nWorkspace: https://modules.revalorllc.com/workspace/${ws.slug}\nOperator view: https://vision-workx.vercel.app/admin/modules`,
  );
}

export async function sendInstallRequest(ws: { name: string; slug: string; ownerEmail: string; domains: string[] }) {
  await send(
    process.env.VW_SIGNUP_ALERT_EMAIL || "admin@revalorllc.com",
    `Install request: ${ws.name} wants Revalor to install VisionWorkx`,
    `${ws.name} asked Revalor to install their VisionWorkx module.\n\nOwner: ${ws.ownerEmail}\nWebsites: ${ws.domains.join(", ") || "(none listed)"}\nWorkspace: https://modules.revalorllc.com/workspace/${ws.slug}/modules\n\nReply to the owner to arrange access to their site builder.`,
  );
}

export async function sendInstallNudge(to: string, name: string, slug: string) {
  await send(
    to,
    "Your VisionWorkx form isn't on your website yet",
    `Hi ${name},\n\nYou're set up, but your form isn't live on your website yet. It takes about two minutes:\n\n• Build or finish your form: https://modules.revalorllc.com/workspace/${slug}/modules/new\n• Copy your one-line snippet and follow the steps for your site builder: https://modules.revalorllc.com/workspace/${slug}/modules\n\nOr use "Have Revalor install it" in your workspace and we'll do it for you.\n\n— VisionWorkx`,
  );
}
