import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";
import { verifyLeadUnsubscribeToken } from "@/lib/leads/unsubscribeToken";

export const runtime = "nodejs";

// Public — intentionally no admin auth. Reached from the unsubscribe link
// in a cold-outreach lead email; the signed token (not a session) is what
// proves the request is legitimate. Sets a hard, permanent suppression
// flag (do_not_email) rather than touching `status`, which tracks sales
// pipeline stage separately — see migration 20240101000084.
export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");
  const payload = token ? verifyLeadUnsubscribeToken(token) : null;

  if (!payload) {
    return new NextResponse("This unsubscribe link is invalid or has expired.", {
      status: 400,
      headers: { "Content-Type": "text/plain" },
    });
  }

  const service = createServiceClient();
  const { error } = await service.from("leads").update({ do_not_email: true }).eq("id", payload.leadId);

  if (error) {
    return new NextResponse("Something went wrong processing your request. Please try again.", {
      status: 500,
      headers: { "Content-Type": "text/plain" },
    });
  }

  return new NextResponse("You've been unsubscribed and won't receive any more emails from us.", {
    status: 200,
    headers: { "Content-Type": "text/plain" },
  });
}
