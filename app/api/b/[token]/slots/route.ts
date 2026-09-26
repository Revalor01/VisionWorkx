import { NextRequest, NextResponse } from "next/server";
import { modulesConfigured } from "@/lib/modules/supabase";
import { generateSlots, localDate } from "@/lib/modules/booking";
import { bookingByToken, busyRanges } from "@/lib/modules/bookingServer";

// Open times for rescheduling: same rules as the public slots API, but the
// customer's own booking doesn't block the times around it.
export const runtime = "nodejs";
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(req: NextRequest, props: { params: Promise<{ token: string }> }) {
  const { token } = await props.params;
  if (!modulesConfigured()) return NextResponse.json({ error: "Not available." }, { status: 503 });
  const b = await bookingByToken(token);
  if (!b || b.status !== "confirmed" || !b.service) return NextResponse.json({ error: "This booking can't be moved." }, { status: 404 });
  const now = new Date();
  const fromParam = req.nextUrl.searchParams.get("from") ?? "";
  const from = DATE_RE.test(fromParam) ? fromParam : localDate(now, b.setup.timeZone);
  const [y, m, d] = from.split("-").map(Number);
  const busy = await busyRanges(b.workspaceId, new Date(Date.UTC(y, m - 1, d) - 86400e3), new Date(Date.UTC(y, m - 1, d + 7) + 86400e3), b.id);
  const slots = generateSlots(b.setup, b.service, from, 7, busy, now).map((s) => s.toISOString());
  return NextResponse.json({ timeZone: b.setup.timeZone, from, slots }, { headers: { "Cache-Control": "no-store" } });
}
