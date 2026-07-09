import { createServerClient } from "@/lib/supabase";
import SettingsClient from "./SettingsClient";

export default async function SettingsPage() {
  const supabase = createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: business } = await supabase
    .from("promote_businesses")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle();

  const { data: subscription } = await supabase
    .from("promote_subscriptions")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle();

  return <SettingsClient userEmail={user.email ?? ""} business={business} subscription={subscription} />;
}
