import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { createServerClient, createServiceClient } from "@/lib/supabase";

export const runtime = "nodejs";

const RESEND_KEY = process.env.RESEND_API_KEY;
const OPERATOR_EMAIL = process.env.OPERATOR_EMAIL || "info@revalorllc.com";
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://vision-workx.vercel.app";

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// POST { sessionId } — called once by /guided/success. Verifies the
// Stripe Checkout session was paid by this user, marks the request paid,
// adds a $10 customer balance credit (applied to the first subscription
// invoice), and sends the confirmation emails. Idempotent.
export async function POST(req: NextRequest) {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) {
    return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  }

  let body: { sessionId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const sessionId = (body.sessionId ?? "").trim();
  if (!sessionId) {
    return NextResponse.json({ error: "Missing session." }, { status: 400 });
  }

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
  const service = createServiceClient();

  const checkout = await stripe.checkout.sessions.retrieve(sessionId);
  if (checkout.metadata?.userId !== user.id) {
    return NextResponse.json({ error: "That session isn't yours." }, { status: 403 });
  }
  if (checkout.payment_status !== "paid") {
    return NextResponse.json({ paid: false, error: "Payment not completed." }, { status: 402 });
  }

  const { data: request } = await service
    .from("guided_session_requests")
    .select("*")
    .eq("stripe_session_id", sessionId)
    .maybeSingle();
  if (!request || request.user_id !== user.id) {
    return NextResponse.json({ error: "Request not found." }, { status: 404 });
  }

  // Already confirmed — no double credit, no double email.
  if (request.paid_at) {
    return NextResponse.json({ ok: true, alreadyConfirmed: true });
  }

  await service
    .from("guided_session_requests")
    .update({ paid_at: new Date().toISOString(), status: "scheduled" })
    .eq("id", request.id);

  // $10 credit toward the first subscription invoice.
  const customerId =
    request.stripe_customer_id ??
    (typeof checkout.customer === "string" ? checkout.customer : checkout.customer?.id ?? null);
  if (customerId) {
    await stripe.customers
      .createBalanceTransaction(customerId, {
        amount: -1000,
        currency: "usd",
        description: "Guided Build Session credit",
      })
      .catch((e) => console.error("[api/guided/confirm] balance credit failed:", e));
  }

  if (RESEND_KEY) {
    const from = "Vision Workx <notifications@notify.revalorllc.com>";
    const name = request.full_name;
    const biz = request.business_name || request.business_type || "your business";
    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${RESEND_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from,
        to: [user.email],
        subject: "Your Guided Build Session is booked",
        html: `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:40px 20px">
          <h1 style="color:#1A3A5C">You're booked in</h1>
          <p>Thanks${name ? `, ${esc(name)}` : ""} — payment received. We've got your Guided Build Session for <strong>${esc(biz)}</strong>.</p>
          <p>We'll work out exactly what your app should do and send your <strong>build brief and a live preview</strong> to this email. Your account is ready now.</p>
          <p style="margin:28px 0"><a href="${APP_URL}/guided/booked" style="background:#1A3A5C;color:#fff;padding:14px 28px;border-radius:8px;text-decoration:none;font-weight:bold">View your booking →</a></p>
          <p style="color:#666;font-size:14px">Your $10 is credited to your first month if you subscribe.</p>
          <p style="color:#999;font-size:12px">Vision Workx · A Revalor Company</p>
        </div>`,
      }),
    }).catch(() => {});
    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${RESEND_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from,
        to: [OPERATOR_EMAIL],
        subject: `Paid Guided Build Session: ${request.business_name || request.business_type}`,
        html: `<div style="font-family:sans-serif;max-width:640px;margin:0 auto">
          <h2 style="color:#1A3A5C">Paid Guided Build Session ($10)</h2>
          <table style="font-size:14px;border-collapse:collapse">
            <tr><td style="padding:4px 14px 4px 0;color:#666">Name</td><td><strong>${esc(request.full_name || "—")}</strong></td></tr>
            <tr><td style="padding:4px 14px 4px 0;color:#666">Email</td><td><strong>${esc(user.email)}</strong></td></tr>
            <tr><td style="padding:4px 14px 4px 0;color:#666">Business</td><td><strong>${esc(request.business_name || "—")} — ${esc(request.business_type || "")}</strong></td></tr>
          </table>
          <p style="font-size:12px;color:#666;margin:16px 0 4px">What they need:</p>
          <pre style="white-space:pre-wrap;font-size:13px;background:#f6f6f6;padding:12px;border-radius:8px">${esc(request.description || "")}</pre>
        </div>`,
      }),
    }).catch(() => {});
  }

  return NextResponse.json({ ok: true });
}
