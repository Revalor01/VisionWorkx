import { cookies } from "next/headers";
import { createServerClient } from "@/lib/supabase";
import { ADMIN_SSO_COOKIE, ADMIN_EMAIL, verifySessionCookie } from "@/lib/adminSso";

// Same operator check as app/admin/page.tsx (reads the shared admin SSO cookie
// or the main-project admin session; never changes either).
export async function isOperator(): Promise<boolean> {
  const cookieStore = await cookies();
  if (verifySessionCookie(cookieStore.get(ADMIN_SSO_COOKIE)?.value, ADMIN_EMAIL)) return true;
  const supabase = await createServerClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  return !error && !!user && user.email === ADMIN_EMAIL;
}
