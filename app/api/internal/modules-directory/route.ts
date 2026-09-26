import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { modulesConfigured, modulesServiceClient } from "@/lib/modules/supabase";
import { embedSnippet } from "@/lib/modules/install";
import { currentPeriod as currentAutomationPeriod, limitsFor } from "@/lib/modules/plans";

// Read-only directory of VisionWorkx client workspaces and modules for
// revalor-admin's "VisionWorkx Clients" section. Machine-to-machine: bearer
// MODULES_DIRECTORY_SECRET (same pattern as MEDIA_SPEND_SECRET). Returns NO
// customer submissions or personal data — only setup metadata and counts.

function authorized(req: NextRequest): boolean {
  const secret = process.env.MODULES_DIRECTORY_SECRET;
  if (!secret) return false;
  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  const a = Buffer.from(token);
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function GET(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!modulesConfigured()) return NextResponse.json({ error: "Modules database isn't configured." }, { status: 503 });
  const db = modulesServiceClient();
  const since = new Date(Date.now() - 30 * 864e5).toISOString();
  const period = currentAutomationPeriod();
  const [{ data: ws }, { data: mods }, { data: members }, { data: subs }, { data: usage }] = await Promise.all([
    db.from("vw_workspaces").select("id, name, slug, domains, plan, billing_status, trial_ends_at, current_period_end, time_zone, created_at").order("created_at", { ascending: false }),
    db.from("vw_modules").select("public_id, workspace_id, type, name, status, created_at, updated_at"),
    db.from("vw_workspace_members").select("workspace_id, role"),
    db.from("vw_submissions").select("workspace_id, created_at").gte("created_at", since),
    db.from("vw_email_usage").select("workspace_id, sent_count").eq("period", period),
  ]);
  const origin = process.env.NEXT_PUBLIC_MODULES_EMBED_ORIGIN ?? "https://modules.revalorllc.com";
  const workspaces = (ws ?? []).map((w) => {
    const wsSubs = (subs ?? []).filter((s) => s.workspace_id === w.id);
    return {
      id: w.id,
      name: w.name,
      slug: w.slug,
      domains: w.domains,
      plan: w.plan,
      billing: { status: w.billing_status, trial_ends_at: w.trial_ends_at, current_period_end: w.current_period_end },
      limits: limitsFor(w.plan),
      time_zone: w.time_zone,
      created_at: w.created_at,
      workspace_url: `${origin}/workspace/${w.slug}`,
      logins: {
        owners: (members ?? []).filter((m) => m.workspace_id === w.id && m.role === "owner").length,
        staff: (members ?? []).filter((m) => m.workspace_id === w.id && m.role === "staff").length,
      },
      submissions_30d: wsSubs.length,
      email_usage: {
        period,
        sent: (usage ?? []).find((u) => u.workspace_id === w.id)?.sent_count ?? 0,
        limit: limitsFor(w.plan).emailsPerMonth,
      },
      last_submission_at: wsSubs.map((s) => s.created_at).sort().pop() ?? null,
      modules: (mods ?? [])
        .filter((m) => m.workspace_id === w.id)
        .map((m) => ({
          public_id: m.public_id,
          type: m.type,
          name: m.name,
          status: m.status,
          created_at: m.created_at,
          updated_at: m.updated_at,
          install_snippet: embedSnippet(m.public_id, origin),
        })),
    };
  });
  return NextResponse.json(
    { generated_at: new Date().toISOString(), workspaces },
    { headers: { "Cache-Control": "no-store" } },
  );
}
