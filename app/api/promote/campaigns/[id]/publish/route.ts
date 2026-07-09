import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { sendCampaignPendingEmail } from "@/lib/promote/email";

// Phase 1 scope: Meta Ads API and Google Ads API both require app review /
// business verification before any campaign can actually go live — that's
// external and not something this route can complete. Rather than silently
// no-op or fake a "live" status, this marks the campaign as pending and
// tells the owner exactly why. Swap in real Meta/Google publish calls here
// once API access is granted (Phase 2) — see lib/promote/platforms/ (TODO).
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createServerClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: campaign } = await supabase
    .from("promote_campaigns")
    .select("id, name, status")
    .eq("id", params.id)
    .maybeSingle();

  if (!campaign) {
    return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
  }
  if (campaign.status !== "draft") {
    return NextResponse.json({ error: "Only draft campaigns can be submitted" }, { status: 400 });
  }

  const { error } = await supabase
    .from("promote_campaigns")
    .update({ status: "pending_platform_approval", updated_at: new Date().toISOString() })
    .eq("id", params.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (user.email) {
    sendCampaignPendingEmail(user.email, campaign.name).catch(() => {});
  }

  return NextResponse.json({
    status: "pending_platform_approval",
    message:
      "Campaign saved. Live publishing to Meta/Google Ads is pending advertising API approval — you'll be notified when it can go live.",
  });
}
