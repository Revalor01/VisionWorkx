import { NextRequest, NextResponse } from "next/server";
import { getModuleByPublicId } from "@/lib/modules/data";
import { modulesConfigured, modulesServiceClient } from "@/lib/modules/supabase";
import { corsHeaders, ipHash, json } from "@/lib/modules/http";
import { billingAllowsService } from "@/lib/modules/plans";
import { generateSlots, localDate } from "@/lib/modules/booking";
import { busyRanges } from "@/lib/modules/bookingServer";

// Public: open start times for one service of a booking module, for up to
// 14 local days from `from`. Only times are returned (never who booked), so
// it's safe to serve to any page; it's rate-limited and CORS'd to the
// workspace's own sites like the other module APIs.
export const runtime = "nodejs";
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function OPTIONS(req: NextRequest, props: { params: Promise<{ moduleId: string }> }) {
  const { moduleId } = await props.params;
  if (!modulesConfigured()) return new NextResponse(null, { status: 204 });
  const mod = await getModuleByPublicId(moduleId);
  return new NextResponse(null, { status: 204, headers: corsHeaders(req, mod?.domains ?? []) });
}

export async function GET(req: NextRequest, props: { params: Promise<{ moduleId: string }> }) {
  const { moduleId } = await props.params;
  if (!modulesConfigured()) return NextResponse.json({ error: "Modules aren't set up yet." }, { status: 503 });
  const mod = await getModuleByPublicId(moduleId);
  if (!mod || !mod.booking || mod.status !== "live" || !billingAllowsService(mod.billingStatus)) {
    return NextResponse.json({ error: "Not available." }, { status: 404 });
  }
  const { data: allowed } = await modulesServiceClient().rpc("vw_rate_check", {
    p_key: `slots:${mod.publicId}:${ipHash(req)}`,
    max_hits: 120,
    window_seconds: 600,
  });
  if (allowed === false) return json(req, mod.domains, { error: "Too many requests — try again shortly." }, 429);

  const service = mod.booking.services.find((s) => s.id === req.nextUrl.searchParams.get("service"));
  if (!service) return json(req, mod.domains, { error: "Unknown service." }, 400);
  const now = new Date();
  const fromParam = req.nextUrl.searchParams.get("from") ?? "";
  const from = DATE_RE.test(fromParam) ? fromParam : localDate(now, mod.booking.timeZone);
  const days = Math.min(14, Math.max(1, Number(req.nextUrl.searchParams.get("days")) || 7));

  // Busy ranges covering the requested window (padded a day each side for time zones).
  const [y, m, d] = from.split("-").map(Number);
  const windowStart = new Date(Date.UTC(y, m - 1, d) - 86400e3);
  const windowEnd = new Date(Date.UTC(y, m - 1, d + days) + 86400e3);
  const busy = await busyRanges(mod.workspaceId, windowStart, windowEnd);
  const slots = generateSlots(mod.booking, service, from, days, busy, now).map((s) => s.toISOString());
  return json(req, mod.domains, { timeZone: mod.booking.timeZone, from, days, slots }, 200, { "Cache-Control": "no-store" });
}
