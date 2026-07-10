import type { User } from "@supabase/supabase-js";
import { createServiceClient } from "@/lib/supabase";

export const ADMIN_EMAIL = "sawilliams721@gmail.com";

export function isAdmin(user: User | null): boolean {
  return !!user && user.email === ADMIN_EMAIL;
}

// Video Pipeline routes are usable by the admin OR any allow-listed editor
// (lets a hired editor be added/removed via social_editors without a redeploy).
export async function isAdminOrEditor(user: User | null): Promise<boolean> {
  if (isAdmin(user)) return true;
  if (!user?.email) return false;

  const service = createServiceClient();
  const { data } = await service.from("social_editors").select("email").eq("email", user.email).maybeSingle();
  return !!data;
}
