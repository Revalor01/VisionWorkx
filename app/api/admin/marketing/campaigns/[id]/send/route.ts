import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";
import { isAdminRequest } from "@/lib/social/adminAuth";
import { getSendableAudience, filterUnsubscribed } from "@/lib/marketing/audience";
import { sendCampaign, sendToRecipients } from "@/lib/marketing/sendCampaign";
import { ADMIN_EMAIL } from "@/lib/adminSso";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  if (!(await isAdminRequest())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: { testOnly?: boolean; recipients?: string[] };
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const service = createServiceClient();
  const { data: campaign, error } = await service
    .from("marketing_campaigns")
    .select("id, product, subject, body_html, status")
    .eq("id", params.id)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!campaign) return NextResponse.json({ error: "Campaign not found" }, { status: 404 });

  try {
    if (body.testOnly) {
      const result = await sendToRecipients({
        product: campaign.product,
        subject: `[TEST] ${campaign.subject}`,
        bodyHtml: campaign.body_html,
        recipients: [ADMIN_EMAIL],
      });
      return NextResponse.json({ ok: result.sent > 0, test: true, ...result });
    }

    // Targeted send to a specific list of emails — still filtered against
    // that product's unsubscribes, but doesn't touch the campaign's
    // status/sent_count (it isn't "the" send, just an ad-hoc one — e.g.
    // testing on a couple of real users, or reaching a handful of people
    // manually rather than the full audience).
    const requested = (body.recipients ?? [])
      .map((e) => e.trim().toLowerCase())
      .filter((e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e));
    if (requested.length > 0) {
      const recipients = await filterUnsubscribed(campaign.product, Array.from(new Set(requested)));
      const result = await sendToRecipients({
        product: campaign.product,
        subject: campaign.subject,
        bodyHtml: campaign.body_html,
        recipients,
      });
      return NextResponse.json({ ok: true, test: false, targeted: true, recipientCount: recipients.length, skipped: requested.length - recipients.length, ...result });
    }

    if (campaign.status === "sent" || campaign.status === "sending") {
      return NextResponse.json({ error: `Campaign already ${campaign.status}` }, { status: 409 });
    }

    const recipients = await getSendableAudience(campaign.product);
    const result = await sendCampaign(campaign.id, recipients.map((r) => r.email));
    return NextResponse.json({ ok: true, test: false, recipientCount: recipients.length, ...result });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
