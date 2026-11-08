import { NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/social/adminAuth";
import { createServiceClient } from "@/lib/supabase";

export const runtime = "nodejs";
export const maxDuration = 30;

// Lets each brand card show the real Facebook Page it posts to — name, picture and
// Page ID — and flag a mismatch (the brand's fb_page_id vs the Page its stored access
// actually belongs to), so a brand wired to another brand's Page is visible at a
// glance. Asks Facebook with each brand's own Page token, server-side; tokens never
// leave the server.
export type FacebookPageInfo = { pageId: string; name: string | null; pictureUrl: string | null; mismatch: boolean };

export async function GET() {
  if (!(await isAdminRequest())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const service = createServiceClient();
  const [{ data: brands }, { data: connections }] = await Promise.all([
    service.from("social_brands").select("id, fb_page_id").not("fb_page_id", "is", null),
    service.from("social_connections").select("brand_id, fb_page_access_token"),
  ]);

  const pages: Record<string, FacebookPageInfo> = {};
  await Promise.all(
    (brands ?? []).map(async (b) => {
      const token = connections?.find((c) => c.brand_id === b.id)?.fb_page_access_token;
      const info: FacebookPageInfo = { pageId: b.fb_page_id!, name: null, pictureUrl: null, mismatch: false };
      if (token) {
        try {
          const url = new URL("https://graph.facebook.com/v21.0/me");
          url.searchParams.set("fields", "id,name,picture{url}");
          url.searchParams.set("access_token", token);
          const res = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(8000) });
          const me = (await res.json()) as { id?: string; name?: string; picture?: { data?: { url?: string } } };
          if (me.id) {
            info.name = me.name ?? null;
            info.pictureUrl = me.picture?.data?.url ?? null;
            info.mismatch = me.id !== b.fb_page_id;
          }
        } catch {
          // Leave the name blank; the card still shows the Page ID.
        }
      }
      pages[b.id] = info;
    })
  );
  return NextResponse.json({ pages });
}
