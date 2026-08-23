import { cookies } from "next/headers";
import { createServerClient } from "@/lib/supabase";
import { ADMIN_EMAIL, ADMIN_SSO_COOKIE, verifySessionCookie } from "@/lib/adminSso";

// Same dual real-session/SSO-cookie check used by /admin/ops — lets
// the cross-app SSO ticket mechanism authenticate API routes, not
// just page loads.
export async function isAdminRequest(): Promise<boolean> {
  const supabase = createServerClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  const isRealAdmin = !error && !!user && user.email === ADMIN_EMAIL;

  const cookieStore = cookies();
  const isSsoAdmin = verifySessionCookie(cookieStore.get(ADMIN_SSO_COOKIE)?.value, ADMIN_EMAIL);

  return isRealAdmin || isSsoAdmin;
}
