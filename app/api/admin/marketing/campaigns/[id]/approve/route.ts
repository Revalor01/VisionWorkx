import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";
import { isAdminRequest } from "@/lib/social/adminAuth";
import { getSendableAudience, filterUnsubscribed } from "@/lib/marketing/audience";
import { sendCampaign } from "@/lib/marketing/sendCampaign";

export const runtime = "nodejs";
export const maxDuration = 300;

// Approves a manual-autonomy campaign the cron route parked in
// pending_review — sends it the same way autonomy: "auto" would have.
export async function POST(_req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  if (!(await isAdminRequest())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const service = createServiceClient();
  const { data: campaign, error: fetchError } = await service
    .from("marketing_campaigns")
    .select("id, product, status, target_emails")
    .eq("id", params.id)
    .maybeSingle();
  if (fetchError) return NextResponse.json({ error: fetchError.message }, { status: 500 });
  if (!campaign) return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
  if (campaign.status !== "pending_review") {
    return NextResponse.json({ error: `Campaign is ${campaign.status}, not pending_review` }, { status: 409 });
  }

  try {
    // A lifecycle firing (or any other targeted send) carries its own
    // recipient list — approving it must send to exactly those people, not
    // the product's whole current audience. Re-filter unsubscribes here
    // too, in case someone opted out between generation and approval.
    const recipients = campaign.target_emails?.length
      ? await filterUnsubscribed(campaign.product, campaign.target_emails)
      : (await getSendableAudience(campaign.product)).map((r) => r.email);
    const result = await sendCampaign(campaign.id, recipients);
    return NextResponse.json({ ok: true, recipientCount: recipients.length, ...result });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
