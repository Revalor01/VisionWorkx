import { NextRequest, NextResponse } from "next/server";
import { requireOwner } from "@/lib/modules/ownerApi";
import { modulesServiceClient } from "@/lib/modules/supabase";
import { createWorkspaceCheckout } from "@/lib/modules/connect";

export const runtime = "nodejs";

async function sendPaymentLinkEmail(to: string, businessName: string, label: string, amountCents: number, url: string) {
  const key = process.env.RESEND_API_KEY;
  if (!key || !to) return;
  const amount = (amountCents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: "VisionWorkx <notifications@notify.revalorllc.com>",
      to: [to],
      subject: `${businessName}: ${label} — ${amount}`,
      text: `${businessName} sent you a payment request.\n\n${label}: ${amount}\n\nPay securely: ${url}\n\nThis link is from ${businessName} via VisionWorkx.`,
    }),
  });
  if (!res.ok) console.error("[modules/invoice] email failed:", res.status);
}

// Owner types an amount for a submission -> a Checkout Session on the
// workspace's connected account -> emailed to the submission's captured
// address. Never touches the public embed widget.
export async function POST(req: NextRequest, props: { params: Promise<{ slug: string; id: string }> }) {
  const { slug, id } = await props.params;
  const auth = await requireOwner(slug);
  if ("error" in auth) return auth.error;

  let body: { amountCents?: unknown; label?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  const amountCents = typeof body.amountCents === "number" ? Math.round(body.amountCents) : 0;
  if (!Number.isFinite(amountCents) || amountCents < 50 || amountCents > 500_000_00) {
    return NextResponse.json({ error: "Enter an amount between $0.50 and $5,000,000." }, { status: 400 });
  }
  const label = typeof body.label === "string" && body.label.trim() ? body.label.trim().slice(0, 60) : "Payment";

  const db = modulesServiceClient();
  const [{ data: sub }, { data: ws }] = await Promise.all([
    db
      .from("vw_submissions")
      .select("id, data, payment_status")
      .eq("id", id)
      .eq("workspace_id", auth.workspace.id) // never touch another workspace's submission
      .maybeSingle(),
    db
      .from("vw_workspaces")
      .select("name, stripe_connect_account_id, connect_payments_status, connect_payments_test_mode")
      .eq("id", auth.workspace.id)
      .single(),
  ]);
  if (!sub) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!ws) return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
  if (sub.payment_status === "paid") return NextResponse.json({ error: "This submission is already paid." }, { status: 409 });

  const data = (sub.data ?? {}) as Record<string, unknown>;
  const email = typeof data.email === "string" ? data.email : null;
  if (!email) return NextResponse.json({ error: "This submission has no email address to send a payment link to." }, { status: 400 });

  const base = req.nextUrl.origin;
  let checkout: { url: string; sessionId: string };
  try {
    checkout = await createWorkspaceCheckout(
      { stripe_connect_account_id: ws.stripe_connect_account_id, connect_payments_status: ws.connect_payments_status, connect_payments_test_mode: ws.connect_payments_test_mode },
      {
        amountCents,
        productName: `${label} — ${ws.name}`,
        successUrl: `${base}/pay/received?session_id={CHECKOUT_SESSION_ID}`,
        cancelUrl: `${base}/pay/cancelled`,
        metadata: { vw_submission_id: sub.id, vw_workspace_id: auth.workspace.id },
      },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Couldn't create the payment link.";
    return NextResponse.json({ error: message.includes("aren't set up") ? "Connect Stripe on the Billing page before sending payment links." : message }, { status: 409 });
  }

  const { error: updateErr } = await db
    .from("vw_submissions")
    .update({ payment_status: "pending", payment_amount_cents: amountCents, stripe_checkout_session_id: checkout.sessionId })
    .eq("id", sub.id);
  if (updateErr) console.error("[modules/invoice] submission update failed:", updateErr.message);

  await sendPaymentLinkEmail(email, ws.name, label, amountCents, checkout.url);
  return NextResponse.json({ ok: true, url: checkout.url });
}
