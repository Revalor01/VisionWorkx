import type { Metadata } from "next";
import { getModuleByPublicId } from "@/lib/modules/data";
import { modulesConfigured } from "@/lib/modules/supabase";
import { resolveBrand } from "@/lib/modules/config";
import { confirmSubmissionPayment } from "@/lib/modules/connect";

// Stripe Checkout's success_url for a module's payment-on-submit flow (see
// app/api/m/[moduleId]/submit/route.ts). Confirms on demand here (same
// pattern app/api/apps/[appId]/checkout/route.ts already uses for connected
// accounts) rather than relying solely on the webhook -- see
// lib/modules/connect.ts's confirmSubmissionPayment for why.

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Payment received", robots: { index: false, follow: false } };

export default async function PaymentReceivedPage(props: { params: Promise<{ moduleId: string }>; searchParams: Promise<{ session_id?: string }> }) {
  const { moduleId } = await props.params;
  const { session_id } = await props.searchParams;
  if (session_id) await confirmSubmissionPayment(session_id);
  const mod = modulesConfigured() ? await getModuleByPublicId(moduleId) : null;
  const brand = mod ? resolveBrand(mod.brand, mod.config.style) : { color: "#1b2542", font: "modern" as const, radius: 10 };

  return (
    <div style={{ font: "15px/1.5 system-ui, sans-serif", color: "#1f2430", padding: "40px 20px", maxWidth: 480, margin: "0 auto", textAlign: "center" }}>
      <div
        aria-hidden
        style={{ width: 48, height: 48, margin: "0 auto 16px", borderRadius: "50%", background: brand.color, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24 }}
      >
        ✓
      </div>
      <h1 style={{ fontSize: 20, fontWeight: 700, margin: "0 0 8px" }}>Payment received</h1>
      <p style={{ color: "#6a7285", margin: 0 }}>
        {mod ? `Thanks — ${mod.workspaceName} has been notified.` : "Thanks — the business has been notified."}
      </p>
    </div>
  );
}
