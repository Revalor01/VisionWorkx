import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";
import { isAdminRequest } from "@/lib/social/adminAuth";
import { getSendableAudience } from "@/lib/marketing/audience";
import { sendCampaign, sendToRecipients } from "@/lib/marketing/sendCampaign";
import { ADMIN_EMAIL } from "@/lib/adminSso";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  if (!(await isAdminRequest())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: { testOnly?: boolean };
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
