import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";
import { verifyUnsubscribeToken } from "@/lib/marketing/unsubscribeToken";

export const runtime = "nodejs";

// Public — intentionally no admin auth. Reached from a link inside an
// email sent to an end-user; the signed token (not a session) is what
// proves the request is legitimate.
export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");
  const payload = token ? verifyUnsubscribeToken(token) : null;

  if (!payload) {
    return new NextResponse("This unsubscribe link is invalid or has expired.", {
      status: 400,
      headers: { "Content-Type": "text/plain" },
    });
  }

  const service = createServiceClient();
  const { error } = await service
    .from("marketing_unsubscribes")
    .upsert({ product: payload.product, email: payload.email.toLowerCase().trim() }, { onConflict: "product,email" });

  if (error) {
    return new NextResponse("Something went wrong processing your request. Please try again.", {
      status: 500,
      headers: { "Content-Type": "text/plain" },
    });
  }

  return new NextResponse(`You've been unsubscribed from ${payload.product} emails and won't receive any more.`, {
    status: 200,
    headers: { "Content-Type": "text/plain" },
  });
}
