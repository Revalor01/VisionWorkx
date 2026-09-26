import { NextRequest, NextResponse } from "next/server";
import { isOperator } from "@/lib/modules/adminGuard";
import { modulesConfigured, modulesServiceClient } from "@/lib/modules/supabase";
import { normalizeDomainList } from "@/lib/modules/domains";
import { DEFAULT_LEAD_FORM, parseFormConfig } from "@/lib/modules/config";
import { MODULE_TYPES, type ModuleType } from "@/lib/modules/constants";
import { limitsFor } from "@/lib/modules/plans";

// Operator-only actions for setting clients up. Everything here uses the
// modules service role, so the operator check comes first, always.

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{1,46}[a-z0-9])$/;

export async function POST(req: NextRequest) {
  if (!(await isOperator())) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!modulesConfigured()) return NextResponse.json({ error: "Modules database isn't configured." }, { status: 503 });

  let b: Record<string, unknown>;
  try {
    b = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const db = modulesServiceClient();
  const action = b.action;

  if (action === "create_workspace") {
    const name = typeof b.name === "string" ? b.name.trim().slice(0, 120) : "";
    const slug = typeof b.slug === "string" ? b.slug.trim().toLowerCase() : "";
    if (!name || !SLUG_RE.test(slug)) return NextResponse.json({ error: "Name and a slug (3–48 lowercase letters, numbers, dashes) are required." }, { status: 400 });
    const email = typeof b.notification_email === "string" && EMAIL_RE.test(b.notification_email.trim()) ? b.notification_email.trim().toLowerCase() : null;
    const { data, error } = await db
      .from("vw_workspaces")
      .insert({ name, slug, domains: normalizeDomainList(b.domains), notification_email: email })
      .select("id, slug")
      .single();
    if (error) return NextResponse.json({ error: error.code === "23505" ? "That slug is taken." : "Couldn't create the workspace." }, { status: 400 });
    return NextResponse.json({ ok: true, workspace: data });
  }

  if (action === "update_domains") {
    const id = String(b.workspace_id ?? "");
    const { error } = await db.from("vw_workspaces").update({ domains: normalizeDomainList(b.domains) }).eq("id", id);
    return error ? NextResponse.json({ error: "Couldn't update domains." }, { status: 400 }) : NextResponse.json({ ok: true });
  }

  if (action === "invite_member") {
    const id = String(b.workspace_id ?? "");
    const email = typeof b.email === "string" ? b.email.trim().toLowerCase() : "";
    const role = b.role === "staff" ? "staff" : "owner";
    if (!EMAIL_RE.test(email)) return NextResponse.json({ error: "Enter a valid email." }, { status: 400 });
    const redirectTo = `${req.nextUrl.origin}/workspace/auth/confirm`; // invite links carry the session in the URL fragment

    let userId: string | null = null;
    const inv = await db.auth.admin.inviteUserByEmail(email, { redirectTo });
    if (inv.data?.user) userId = inv.data.user.id;
    else {
      // Already has a login: find it and just add the membership.
      for (let page = 1; page <= 10 && !userId; page++) {
        const { data } = await db.auth.admin.listUsers({ page, perPage: 200 });
        const hit = data?.users.find((u) => u.email?.toLowerCase() === email);
        if (hit) userId = hit.id;
        if (!data || data.users.length < 200) break;
      }
    }
    if (!userId) return NextResponse.json({ error: inv.error?.message ?? "Couldn't invite that email." }, { status: 400 });
    const { error } = await db.from("vw_workspace_members").upsert({ workspace_id: id, user_id: userId, role });
    if (error) return NextResponse.json({ error: "Invited, but couldn't add them to the workspace." }, { status: 500 });
    return NextResponse.json({ ok: true, invited: !!inv.data?.user });
  }

  if (action === "create_module") {
    const id = String(b.workspace_id ?? "");
    const type = MODULE_TYPES.includes(b.type as ModuleType) ? (b.type as ModuleType) : "lead_capture";
    const name = typeof b.name === "string" && b.name.trim() ? b.name.trim().slice(0, 120) : "Lead capture form";
    const config = b.config ? parseFormConfig(b.config) : DEFAULT_LEAD_FORM;
    const { data: wsRow } = await db.from("vw_workspaces").select("plan, billing_status").eq("id", id).single();
    const { count } = await db.from("vw_modules").select("id", { count: "exact", head: true }).eq("workspace_id", id);
    if (wsRow && wsRow.billing_status !== "comped" && (count ?? 0) >= limitsFor(wsRow.plan).modules) {
      return NextResponse.json({ error: `Plan limit: ${limitsFor(wsRow.plan).modules} modules on ${wsRow.plan}.` }, { status: 402 });
    }
    const { data, error } = await db
      .from("vw_modules")
      .insert({ workspace_id: id, type, name, config })
      .select("id, public_id")
      .single();
    if (error) return NextResponse.json({ error: "Couldn't create the module." }, { status: 400 });
    return NextResponse.json({ ok: true, module: data });
  }

  if (action === "set_module_status") {
    const status = ["draft", "live", "paused"].includes(b.status as string) ? (b.status as string) : null;
    if (!status) return NextResponse.json({ error: "Bad status" }, { status: 400 });
    const { error } = await db.from("vw_modules").update({ status }).eq("public_id", String(b.public_id ?? ""));
    return error ? NextResponse.json({ error: "Couldn't update." }, { status: 400 }) : NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
