import { NextRequest, NextResponse } from "next/server";
import { requireOwner } from "@/lib/modules/ownerApi";
import { bookingForWorkspace, cancelBooking } from "@/lib/modules/bookingServer";

// Owner cancels a booking from the Bookings tab (no notice cutoff for owners).
export const runtime = "nodejs";

export async function POST(req: NextRequest, props: { params: Promise<{ slug: string; id: string }> }) {
  const { slug, id } = await props.params;
  const origin = req.headers.get("origin");
  if (origin && origin !== req.nextUrl.origin) return NextResponse.json({ error: "Bad origin" }, { status: 403 });
  const auth = await requireOwner(slug);
  if ("error" in auth) return auth.error;
  const b = await bookingForWorkspace(auth.workspace.id, id);
  if (!b) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const r = await cancelBooking(b, "owner");
  return NextResponse.json(r.ok ? { ok: true } : { error: r.error }, { status: r.ok ? 200 : 409 });
}
