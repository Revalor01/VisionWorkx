import { NextRequest, NextResponse } from "next/server";
import { createServerClient, createServiceClient } from "@/lib/supabase";

export const runtime = "nodejs";

const RESEND_KEY = process.env.RESEND_API_KEY;
const OPERATOR_EMAIL = process.env.OPERATOR_EMAIL || "info@revalorllc.com";
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://vision-workx.vercel.app";

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// POST { fullName, businessName, businessType, description } — the caller
// must already be signed in (the /guided form creates the account first,
// same as /signup). Files a guided_session_requests row and emails the
// customer + operator.
export async function POST(req: NextRequest) {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  }

  let body: {
    fullName?: string;
    businessName?: string;
    businessType?: string;
    description?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const fullName = (body.fullName ?? "").trim().slice(0, 120) || null;
  const businessName = (body.businessName ?? "").trim().slice(0, 120) || null;
  const businessType = (body.businessType ?? "").trim().slice(0, 120) || null;
  const description = (body.description ?? "").trim().slice(0, 1500) || null;

  if (!businessType || !description || description.length < 10) {
    return NextResponse.json(
      { error: "Add your business type and a few sentences about what you need." },
      { status: 400 },
    );
  }

  const service = createServiceClient();
  const { error } = await service.from("guided_session_requests").insert({
    user_id: user.id,
    email: user.email ?? "",
    full_name: fullName,
    business_name: businessName,
    business_type: businessType,
    description,
  });
  if (error) {
    console.error("[api/guided] insert failed:", error.message);
    return NextResponse.json({ error: "Couldn't file your request. Try again." }, { status: 500 });
  }

  if (RESEND_KEY && user.email) {
    const from = "Vision Workx <notifications@notify.revalorllc.com>";
    // Customer
    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${RESEND_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from,
        to: [user.email],
        subject: "Your Guided Build Session is booked",
        html: `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:40px 20px">
          <h1 style="color:#1A3A5C">You're booked in</h1>
          <p>Thanks${fullName ? `, ${esc(fullName)}` : ""}. We've got your Guided Build Session request for <strong>${esc(businessName || businessType || "your business")}</strong>.</p>
          <p>We'll work out exactly what your app should do and send your <strong>build brief and a live preview</strong> to this email. Your account is ready now — log in any time.</p>
          <p style="margin:28px 0"><a href="${APP_URL}/dashboard" style="background:#1A3A5C;color:#fff;padding:14px 28px;border-radius:8px;text-decoration:none;font-weight:bold">Go to your dashboard →</a></p>
          <p style="color:#666;font-size:14px">The $10 session fee is credited to your first month if you subscribe.</p>
          <p style="color:#999;font-size:12px">Vision Workx · A Revalor Company</p>
        </div>`,
      }),
    }).catch(() => {});
    // Operator
    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${RESEND_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from,
        to: [OPERATOR_EMAIL],
        subject: `New Guided Build Session: ${businessName || businessType}`,
        html: `<div style="font-family:sans-serif;max-width:640px;margin:0 auto">
          <h2 style="color:#1A3A5C">New Guided Build Session request</h2>
          <table style="font-size:14px;border-collapse:collapse">
            <tr><td style="padding:4px 14px 4px 0;color:#666">Name</td><td><strong>${esc(fullName || "—")}</strong></td></tr>
            <tr><td style="padding:4px 14px 4px 0;color:#666">Email</td><td><strong>${esc(user.email)}</strong></td></tr>
            <tr><td style="padding:4px 14px 4px 0;color:#666">Business</td><td><strong>${esc(businessName || "—")} — ${esc(businessType)}</strong></td></tr>
          </table>
          <p style="font-size:12px;color:#666;margin:16px 0 4px">What they need:</p>
          <pre style="white-space:pre-wrap;font-size:13px;background:#f6f6f6;padding:12px;border-radius:8px">${esc(description)}</pre>
        </div>`,
      }),
    }).catch(() => {});
  }

  return NextResponse.json({ ok: true });
}
