import { NextRequest, NextResponse } from "next/server";
import { requireOwner } from "@/lib/modules/ownerApi";
import { modulesServiceClient } from "@/lib/modules/supabase";
import { EMAIL_KINDS, type EmailKind } from "@/lib/modules/emailDefaults";

// Owners save their workspace-wide email templates. Templates are
// server-written only (RLS), so ownership is checked here first.
export async function PUT(req: NextRequest, props: { params: Promise<{ slug: string }> }) {
  const { slug } = await props.params;
  const auth = await requireOwner(slug);
  if ("error" in auth) return auth.error;
  let b: { kind?: unknown; subject?: unknown; body?: unknown; enabled?: unknown; delayHours?: unknown };
  try {
    b = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  const kind = EMAIL_KINDS.includes(b.kind as EmailKind) ? (b.kind as EmailKind) : null;
  const subject = typeof b.subject === "string" ? b.subject.trim().slice(0, 200) : "";
  const body = typeof b.body === "string" ? b.body.trim().slice(0, 5000) : "";
  if (!kind || !subject || !body) return NextResponse.json({ error: "Subject and message are required." }, { status: 400 });
  const delay = kind === "follow_up" ? Math.max(1, Math.min(2160, Math.round(Number(b.delayHours) || 48))) : 0;

  const db = modulesServiceClient();
  const { data: existing } = await db
    .from("vw_email_templates")
    .select("id")
    .eq("workspace_id", auth.workspace.id)
    .is("module_id", null)
    .eq("kind", kind)
    .maybeSingle();
  const row = { subject, body, enabled: b.enabled !== false, delay_hours: delay };
  const { error } = existing
    ? await db.from("vw_email_templates").update(row).eq("id", existing.id)
    : await db.from("vw_email_templates").insert({ ...row, workspace_id: auth.workspace.id, kind });
  if (error) return NextResponse.json({ error: "Couldn't save the email." }, { status: 500 });
  return NextResponse.json({ ok: true });
}
