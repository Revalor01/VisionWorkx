import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";
import { isAdminRequest } from "@/lib/social/adminAuth";
import { getPushAudience, getSmsAudience, filterSmsOptOuts } from "@/lib/mobile/audience";
import { sendMobileCampaign } from "@/lib/mobile/sendCampaign";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  if (!(await isAdminRequest())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: { targets?: string[] };
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const service = createServiceClient();
  const { data: campaign, error } = await service
    .from("marketing_campaigns")
    .select("id, product, channel, status")
    .eq("id", params.id)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!campaign) return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
  if (campaign.channel === "email") return NextResponse.json({ error: "Not a mobile campaign" }, { status: 400 });

  try {
    // A manually-supplied token/phone list — the only way to actually test
    // a send today, since the real audience resolver is honestly empty
    // (see lib/mobile/audience.ts) until a product captures tokens/consent.
    const targets = body.targets?.filter((t) => t.trim()) ?? [];
    if (targets.length > 0) {
      const cleaned = campaign.channel === "sms" ? await filterSmsOptOuts(targets) : targets;
      const result = await sendMobileCampaign(campaign.id, cleaned);
      return NextResponse.json({ ok: true, targeted: true, recipientCount: cleaned.length, ...result });
    }

    if (campaign.status === "sent" || campaign.status === "sending") {
      return NextResponse.json({ error: `Campaign already ${campaign.status}` }, { status: 409 });
    }

    const recipients =
      campaign.channel === "push"
        ? (await getPushAudience(campaign.product)).map((r) => r.token)
        : await filterSmsOptOuts((await getSmsAudience(campaign.product)).map((r) => r.phone));

    const result = await sendMobileCampaign(campaign.id, recipients);
    return NextResponse.json({ ok: true, targeted: false, recipientCount: recipients.length, ...result });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
