import { NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/social/adminAuth";
import { listSocialApiAccounts } from "@/lib/social/socialApi";

export const runtime = "nodejs";
export const maxDuration = 30;

// Lets the Brands tab show the real connected account's avatar/username
// next to the "IG CONNECTED" badge — a mismatch here (e.g. the wrong
// brand pointing at another brand's real Instagram account) should be
// visible at a glance instead of only discoverable after a post goes out.
export async function GET() {
  if (!(await isAdminRequest())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const accounts = await listSocialApiAccounts();
    return NextResponse.json({ accounts });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
