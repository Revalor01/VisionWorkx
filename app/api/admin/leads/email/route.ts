import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { createServerClient, createServiceClient } from "@/lib/supabase";

const ADMIN_EMAIL = "sawilliams721@gmail.com";
const RESEND_KEY = process.env.RESEND_API_KEY;

// Sent as a base64 attachment on every lead outreach email, regardless of
// mode — reused across sends rather than read from disk per-recipient.
const MEDIA_GUIDE_PATH = path.join(process.cwd(), "public", "revalor-media-guide.pdf");

function interpolate(template: string, businessName: string): string {
  return template.replaceAll("{{business_name}}", businessName);
}

function genericSubject(businessName: string): string {
  return `A quick idea for ${businessName}`;
}

function genericBodyHtml(businessName: string): string {
  return `
    <p>Hi ${businessName} team,</p>
    <p>I'm reaching out from Revalor LLC — we build software that helps businesses like yours save time and grow. I've attached a quick guide to what we offer.</p>
    <p>Happy to answer any questions.</p>
    <p>Best,<br>Revalor Team</p>
  `;
}

async function sendLeadEmail(params: {
  to: string;
  subject: string;
  bodyHtml: string;
  attachmentBase64: string;
}): Promise<{ ok: boolean; error?: string }> {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RESEND_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      // TODO: switch to an @revalorllc.com sender once that domain is
      // verified in Resend (onboarding@resend.dev is the sandbox sender —
      // it can only deliver to the Resend account's own verified email,
      // not to real lead inboxes).
      from: "Revalor LLC <onboarding@resend.dev>",
      to: [params.to],
      reply_to: "admin@revalorllc.com",
      subject: params.subject,
      html: `<div style="font-family:'Helvetica Neue',Arial,sans-serif;max-width:600px;margin:0 auto">${params.bodyHtml}</div>`,
      attachments: [
        {
          filename: "Revalor Media Guide.pdf",
          content: params.attachmentBase64,
        },
      ],
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    return { ok: false, error: `Resend ${res.status}: ${text}` };
  }
  return { ok: true };
}

export async function POST(req: NextRequest) {
  const supabase = createServerClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user || user.email !== ADMIN_EMAIL) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!RESEND_KEY) {
    return NextResponse.json({ error: "Email sending is not configured" }, { status: 500 });
  }

  let body: { leadIds?: string[]; mode?: "custom" | "generic"; subject?: string; body?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const leadIds = Array.isArray(body.leadIds) ? body.leadIds.filter((id) => typeof id === "string") : [];
  if (leadIds.length === 0) {
    return NextResponse.json({ error: "No leads selected" }, { status: 400 });
  }

  const mode = body.mode === "custom" ? "custom" : "generic";
  if (mode === "custom" && (!body.subject?.trim() || !body.body?.trim())) {
    return NextResponse.json({ error: "Subject and body are required for a custom email" }, { status: 400 });
  }

  const service = createServiceClient();
  const { data: leads, error: fetchError } = await service
    .from("leads")
    .select("id, business_name, email")
    .in("id", leadIds);

  if (fetchError) {
    return NextResponse.json({ error: fetchError.message }, { status: 500 });
  }

  const emailable = (leads ?? []).filter((l) => l.email);
  const skipped = (leads?.length ?? 0) - emailable.length;
  const attachmentBase64 = fs.readFileSync(MEDIA_GUIDE_PATH).toString("base64");

  const sentLeadIds: string[] = [];
  const failed: { leadId: string; error: string }[] = [];

  const BATCH_SIZE = 5;
  for (let i = 0; i < emailable.length; i += BATCH_SIZE) {
    const batch = emailable.slice(i, i + BATCH_SIZE);
    const results = await Promise.all(
      batch.map(async (lead) => {
        const subject = mode === "custom" ? interpolate(body.subject!, lead.business_name) : genericSubject(lead.business_name);
        const bodyHtml = mode === "custom" ? interpolate(body.body!, lead.business_name) : genericBodyHtml(lead.business_name);
        const result = await sendLeadEmail({ to: lead.email!, subject, bodyHtml, attachmentBase64 });
        return { lead, result };
      })
    );

    for (const { lead, result } of results) {
      if (result.ok) {
        sentLeadIds.push(lead.id);
      } else {
        failed.push({ leadId: lead.id, error: result.error ?? "Unknown error" });
      }
    }
  }

  if (sentLeadIds.length > 0) {
    const now = new Date().toISOString();
    await service
      .from("leads")
      .update({ status: "contacted", last_contacted_at: now, updated_at: now })
      .in("id", sentLeadIds)
      .eq("status", "new");

    await service.from("lead_events").insert(
      sentLeadIds.map((leadId) => ({
        lead_id: leadId,
        event_type: "email_sent",
        notes: mode === "custom" ? "Custom outreach email sent" : "Generic outreach email sent",
      }))
    );
  }

  return NextResponse.json({
    ok: true,
    sent: sentLeadIds.length,
    sentLeadIds,
    skipped,
    failed,
  });
}
