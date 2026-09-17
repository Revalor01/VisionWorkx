import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { createServerClient, createServiceClient } from "@/lib/supabase";
import { signLeadUnsubscribeToken } from "@/lib/leads/unsubscribeToken";

const ADMIN_EMAIL = "sawilliams721@gmail.com";
const RESEND_KEY = process.env.RESEND_API_KEY;
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://vision-workx.vercel.app";

// CAN-SPAM requires a valid physical postal address on every commercial
// email. *** PLACEHOLDER — replace with Revalor LLC's real registered
// mailing address before sending beyond a small test batch. *** No real
// address was on file anywhere this could pull from automatically.
const PHYSICAL_ADDRESS = "Revalor LLC — [mailing address needed]";

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

// CAN-SPAM footer — physical address + opt-out link — appended to every
// lead email regardless of generic/custom mode, so it can't be forgotten
// per-template. The opt-out link carries a signed, lead-scoped token (see
// lib/leads/unsubscribeToken.ts); clicking it sets leads.do_not_email,
// which this route's own send loop checks before ever emailing again.
function complianceFooterHtml(leadId: string): string {
  const token = signLeadUnsubscribeToken({ leadId });
  const unsubscribeUrl = `${APP_URL}/api/leads/unsubscribe?token=${encodeURIComponent(token)}`;
  return `
    <p style="margin-top:32px;padding-top:16px;border-top:1px solid #e2e6ed;font-size:11px;color:#8b90a0;line-height:1.6">
      ${PHYSICAL_ADDRESS}<br>
      Don't want to hear from us again? <a href="${unsubscribeUrl}" style="color:#8b90a0">Unsubscribe</a>.
    </p>
  `;
}

async function sendLeadEmail(params: {
  to: string;
  subject: string;
  bodyHtml: string;
  attachmentBase64: string;
  leadId: string;
}): Promise<{ ok: boolean; error?: string }> {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RESEND_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: "Revalor LLC <outreach@notify.revalorllc.com>",
      to: [params.to],
      reply_to: "admin@revalorllc.com",
      subject: params.subject,
      html: `<div style="font-family:'Helvetica Neue',Arial,sans-serif;max-width:600px;margin:0 auto">${params.bodyHtml}${complianceFooterHtml(params.leadId)}</div>`,
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
  const supabase = await createServerClient();
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
    .select("id, business_name, email, do_not_email")
    .in("id", leadIds);

  if (fetchError) {
    return NextResponse.json({ error: fetchError.message }, { status: 500 });
  }

  // do_not_email is a hard, permanent suppression (see migration
  // 20240101000084) — never send to one of these regardless of what
  // status/leadIds the caller passed in.
  const emailable = (leads ?? []).filter((l) => l.email && !l.do_not_email);
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
        const result = await sendLeadEmail({ to: lead.email!, subject, bodyHtml, attachmentBase64, leadId: lead.id });
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
