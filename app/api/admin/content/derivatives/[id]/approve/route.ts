import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";
import { isAdminRequest } from "@/lib/social/adminAuth";
import { getSendableAudience } from "@/lib/marketing/audience";
import { sendCampaign } from "@/lib/marketing/sendCampaign";
import { getPushAudience, getSmsAudience, filterSmsOptOuts } from "@/lib/mobile/audience";
import { sendMobileCampaign } from "@/lib/mobile/sendCampaign";

export const runtime = "nodejs";
export const maxDuration = 300;

// Approves a pending_review derivative. Social derivatives aren't handled
// here — they're reviewed/approved from the existing Social Media Manager
// (this row is a plain social_content draft there, nothing content-engine
// specific to approve on this side).
export async function POST(_req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  if (!(await isAdminRequest())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const service = createServiceClient();
  const { data: derivative, error: fetchError } = await service
    .from("content_derivatives")
    .select("*")
    .eq("id", params.id)
    .maybeSingle();
  if (fetchError) return NextResponse.json({ error: fetchError.message }, { status: 500 });
  if (!derivative) return NextResponse.json({ error: "Derivative not found" }, { status: 404 });
  if (derivative.status !== "pending_review") {
    return NextResponse.json({ error: `Derivative is ${derivative.status}, not pending_review` }, { status: 409 });
  }

  try {
    if (derivative.channel === "blog") {
      if (!derivative.blog_post_id) throw new Error("Derivative has no linked blog post");
      const { data: post } = await service.from("blog_posts").select("product").eq("id", derivative.blog_post_id).maybeSingle();
      if (!post) throw new Error("Linked blog post not found");
      await service
        .from("blog_posts")
        .update({ status: "published", published_at: new Date().toISOString() })
        .eq("id", derivative.blog_post_id);
      await service.from("content_derivatives").update({ status: "published", updated_at: new Date().toISOString() }).eq("id", params.id);
      return NextResponse.json({ ok: true });
    }

    if (derivative.channel === "email" || derivative.channel === "push" || derivative.channel === "sms") {
      if (!derivative.marketing_campaign_id) throw new Error("Derivative has no linked campaign");
      const { data: campaign } = await service
        .from("marketing_campaigns")
        .select("id, product, channel")
        .eq("id", derivative.marketing_campaign_id)
        .maybeSingle();
      if (!campaign) throw new Error("Linked campaign not found");

      const result =
        campaign.channel === "email"
          ? await sendCampaign(campaign.id, (await getSendableAudience(campaign.product)).map((r) => r.email))
          : await sendMobileCampaign(
              campaign.id,
              campaign.channel === "push"
                ? (await getPushAudience(campaign.product)).map((r) => r.token)
                : await filterSmsOptOuts((await getSmsAudience(campaign.product)).map((r) => r.phone))
            );

      await service.from("content_derivatives").update({ status: "published", updated_at: new Date().toISOString() }).eq("id", params.id);
      return NextResponse.json({ ok: true, ...result });
    }

    return NextResponse.json({ error: "Social derivatives are approved from the Social Media Manager" }, { status: 400 });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
