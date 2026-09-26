import type { Metadata } from "next";
import { confirmSubmissionPayment } from "@/lib/modules/connect";

// success_url for a business-sent payment link (micro-invoicing), see
// app/api/workspace/[slug]/submissions/[id]/invoice/route.ts. Confirms
// on-demand (see lib/modules/connect.ts's confirmSubmissionPayment) rather
// than relying solely on the webhook.

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Payment received", robots: { index: false, follow: false } };

export default async function PaymentReceivedPage(props: { searchParams: Promise<{ session_id?: string }> }) {
  const { session_id } = await props.searchParams;
  if (session_id) await confirmSubmissionPayment(session_id);
  return (
    <div style={{ font: "15px/1.5 system-ui, sans-serif", color: "#1f2430", padding: "60px 20px", maxWidth: 480, margin: "0 auto", textAlign: "center" }}>
      <div aria-hidden style={{ width: 48, height: 48, margin: "0 auto 16px", borderRadius: "50%", background: "#1b2542", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24 }}>
        ✓
      </div>
      <h1 style={{ fontSize: 20, fontWeight: 700, margin: "0 0 8px" }}>Payment received</h1>
      <p style={{ color: "#6a7285", margin: 0 }}>Thanks — the business has been notified. You can close this tab.</p>
    </div>
  );
}
