import type { Metadata } from "next";

export const metadata: Metadata = { title: "Payment cancelled", robots: { index: false, follow: false } };

export default function PaymentCancelledPage() {
  return (
    <div style={{ font: "15px/1.5 system-ui, sans-serif", color: "#1f2430", padding: "60px 20px", maxWidth: 480, margin: "0 auto", textAlign: "center" }}>
      <h1 style={{ fontSize: 20, fontWeight: 700, margin: "0 0 8px" }}>Payment cancelled</h1>
      <p style={{ color: "#6a7285", margin: 0 }}>Nothing was charged. Contact the business directly if you still need to pay.</p>
    </div>
  );
}
