import { createServerClient } from "@/lib/supabase";
import CreativesClient from "./CreativesClient";

export default async function CreativesPage() {
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

  const { data: creatives } = await supabase
    .from("promote_creatives")
    .select("*")
    .eq("business_id", business?.id ?? "")
    .order("created_at", { ascending: false });

  return <CreativesClient initialCreatives={creatives ?? []} />;
}
