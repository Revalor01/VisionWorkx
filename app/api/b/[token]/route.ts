import { NextRequest, NextResponse } from "next/server";
import { modulesConfigured, modulesServiceClient } from "@/lib/modules/supabase";
import { ipHash } from "@/lib/modules/http";
import { bookingByToken, cancelBooking, rescheduleBooking, rescheduleReminder } from "@/lib/modules/bookingServer";

// Customer's manage link: cancel or reschedule. The token in the URL is the
// only credential (unguessable, 192 bits; only its hash is stored).
export const runtime = "nodejs";

export async function POST(req: NextRequest, props: { params: Promise<{ token: string }> }) {
  const { token } = await props.params;
  if (!modulesConfigured()) return NextResponse.json({ error: "Not available." }, { status: 503 });
  const origin = req.headers.get("origin");
  if (origin && origin !== req.nextUrl.origin) return NextResponse.json({ error: "Bad origin" }, { status: 403 });
  const { data: allowed } = await modulesServiceClient().rpc("vw_rate_check", { p_key: `bmanage:${ipHash(req)}`, max_hits: 30, window_seconds: 600 });
  if (allowed === false) return NextResponse.json({ error: "Too many attempts — try again shortly." }, { status: 429 });

  const b = await bookingByToken(token);
  if (!b) return NextResponse.json({ error: "We couldn't find that booking." }, { status: 404 });
  let body: { action?: unknown; start?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  if (body.action === "cancel") {
    const r = await cancelBooking(b, "customer");
    return NextResponse.json(r.ok ? { ok: true } : { error: r.error }, { status: r.ok ? 200 : 409 });
  }
  if (body.action === "reschedule") {
    const start = new Date(typeof body.start === "string" ? body.start : "");
    if (Number.isNaN(start.getTime())) return NextResponse.json({ error: "Pick a new time." }, { status: 400 });
    const r = await rescheduleBooking(b, start);
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: 409 });
    await rescheduleReminder(b, start, token);
    return NextResponse.json({ ok: true });
  }
  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
