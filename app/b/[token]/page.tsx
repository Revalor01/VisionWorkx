import type { Metadata } from "next";
import { modulesConfigured } from "@/lib/modules/supabase";
import { getModuleByPublicId } from "@/lib/modules/data";
import { resolveBrand } from "@/lib/modules/config";
import { canChange } from "@/lib/modules/booking";
import { bookingByToken } from "@/lib/modules/bookingServer";
import ManageBooking from "./ManageBooking";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Your booking", robots: { index: false, follow: false } };

export default async function ManageBookingPage(props: { params: Promise<{ token: string }> }) {
  const { token } = await props.params;
  const b = modulesConfigured() ? await bookingByToken(token) : null;
  if (!b) {
    return (
      <main style={{ font: "15px/1.5 system-ui, sans-serif", padding: "60px 20px", maxWidth: 480, margin: "0 auto", textAlign: "center", color: "#1f2533" }}>
        <h1 style={{ fontSize: 20 }}>We couldn&apos;t find that booking</h1>
        <p style={{ color: "#5f6778" }}>The link may be incomplete. Check your confirmation email, or contact the business directly.</p>
      </main>
    );
  }
  const mod = await getModuleByPublicId(b.modulePublicId);
  const brand = mod ? resolveBrand(mod.brand, mod.config.style) : { color: "#1b2542", font: "modern" as const, radius: 10 };
  return (
    <ManageBooking
      token={token}
      businessName={b.businessName}
      logoUrl={mod?.logoUrl ?? null}
      brand={brand}
      setup={b.setup}
      service={b.service}
      serviceName={b.serviceName}
      startsAt={b.startsAt.toISOString()}
      status={b.status}
      changeable={canChange(b.setup, b.startsAt, new Date())}
      modulePublicId={b.modulePublicId}
    />
  );
}
