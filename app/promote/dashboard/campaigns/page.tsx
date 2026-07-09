import { createServerClient } from "@/lib/supabase";
import CampaignsClient from "./CampaignsClient";

export default async function CampaignsPage() {
  const supabase = createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: business } = await supabase
    .from("promote_businesses")
    .select("id")
    .eq("user_id", user.id)
    .maybeSingle();

  const businessId = business?.id ?? "";

  const [{ data: campaigns }, { data: creatives }] = await Promise.all([
    supabase.from("promote_campaigns").select("*").eq("business_id", businessId).order("created_at", { ascending: false }),
    supabase
      .from("promote_creatives")
      .select("*")
      .eq("business_id", businessId)
      .neq("status", "archived")
      .order("created_at", { ascending: false }),
  ]);

  return <CampaignsClient initialCampaigns={campaigns ?? []} availableCreatives={creatives ?? []} />;
}
