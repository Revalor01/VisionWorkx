import { NextRequest, NextResponse } from "next/server";
import { modulesConfigured } from "@/lib/modules/supabase";
import { icsFor } from "@/lib/modules/booking";
import { bookingByToken, manageUrl } from "@/lib/modules/bookingServer";

// "Add to my calendar" for one booking (always reflects the current time).
export const runtime = "nodejs";

export async function GET(_req: NextRequest, props: { params: Promise<{ token: string }> }) {
  const { token } = await props.params;
  if (!modulesConfigured()) return new NextResponse("Not available", { status: 503 });
  const b = await bookingByToken(token);
  if (!b || b.status !== "confirmed") return new NextResponse("This booking isn't active.", { status: 404 });
  const ics = icsFor({
    uid: b.id,
    start: b.startsAt,
    end: b.endsAt,
    title: `${b.serviceName} with ${b.businessName}`,
    description: `${b.setup.locationNote ? `${b.setup.locationNote}\n` : ""}Change or cancel: ${manageUrl(token)}`,
    location: b.setup.locationNote,
  });
  return new NextResponse(ics, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="booking.ics"`,
      "Cache-Control": "no-store",
    },
  });
}
