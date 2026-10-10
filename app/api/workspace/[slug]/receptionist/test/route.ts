import { NextRequest, NextResponse } from "next/server";
import { requireOwner } from "@/lib/modules/ownerApi";
import { modulesServiceClient } from "@/lib/modules/supabase";
import { getModuleByPublicId } from "@/lib/modules/data";
import { isSlotAvailable } from "@/lib/modules/booking";
import { busyRanges } from "@/lib/modules/bookingServer";
import { aiCostUsd, logAiUsage } from "@/lib/aiUsage";
import { parseReceptionistConfig } from "@/lib/receptionist/config";
import { buildSystemPrompt } from "@/lib/receptionist/prompt";
import { RECEPTIONIST_MODEL, runTurn } from "@/lib/receptionist/chat";
import { nowText } from "@/lib/receptionist/server";
import type { ToolDeps } from "@/lib/receptionist/tools";

// Owner-only "Test it" for the receptionist setup page: chats with the
// UNSAVED config. Nothing is stored — bookings and messages are simulated
// (availability is real, read-only). Rate-limited per workspace.

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: NextRequest, props: { params: Promise<{ slug: string }> }) {
  const { slug } = await props.params;
  const auth = await requireOwner(slug);
  if ("error" in auth) return auth.error;

  let body: { config?: unknown; history?: unknown; message?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  const message = typeof body.message === "string" ? body.message.trim().slice(0, 1000) : "";
  if (!message) return NextResponse.json({ error: "Type a message first." }, { status: 400 });
  const history = (Array.isArray(body.history) ? body.history : [])
    .slice(-20)
    .flatMap((m): { role: "visitor" | "assistant"; content: string }[] => {
      const o = (m && typeof m === "object" ? m : {}) as { role?: unknown; content?: unknown };
      const role = o.role === "visitor" || o.role === "assistant" ? o.role : null;
      return role && typeof o.content === "string" ? [{ role, content: o.content.slice(0, 2000) }] : [];
    });

  const { data: allowed } = await modulesServiceClient().rpc("vw_rate_check", {
    p_key: `rtest:${auth.workspace.id}`,
    max_hits: 60,
    window_seconds: 3600,
  });
  if (allowed === false) return NextResponse.json({ error: "You've tested a lot this hour — try again a bit later." }, { status: 429 });

  const config = parseReceptionistConfig(body.config);
  // A linked booking module must be a booking module in THIS workspace (draft is fine for testing).
  const linked = config.receptionist.bookingModuleId ? await getModuleByPublicId(config.receptionist.bookingModuleId) : null;
  const booking =
    linked && linked.workspaceId === auth.workspace.id && linked.type === "booking" && linked.booking && linked.booking.services.length > 0 ? linked : null;

  const deps: ToolDeps = {
    now: () => new Date(),
    busyRanges: (ws, from, to) => busyRanges(ws, from, to),
    reserveSlot: async ({ workspaceId, setup, service, start }) => {
      const dayMs = 86400e3;
      const busy = await busyRanges(workspaceId, new Date(start.getTime() - dayMs), new Date(start.getTime() + dayMs));
      return isSlotAvailable(setup, service, start, busy, new Date()) ? { ok: true, bookingId: "test", token: "test" } : { ok: false, reason: "unavailable" };
    },
    createLead: async () => ({ ok: true, submissionId: "test" }),
    claimSave: async () => true,
    afterBooking: async () => {},
    manageUrl: () => "(test — no link)",
    cancelReservation: async () => {},
  };

  const turn = await runTurn({
    system: buildSystemPrompt({
      businessName: auth.workspace.name,
      setup: config.receptionist,
      channel: "chat",
      timeZone: auth.workspace.time_zone,
      services: booking?.booking?.services ?? [],
      nowText: nowText(auth.workspace.time_zone),
    }),
    history,
    message,
    canBook: !!booking,
    ctx: {
      channel: "chat",
      workspaceId: auth.workspace.id,
      plan: auth.workspace.plan,
      workspaceName: auth.workspace.name,
      sourceUrl: null,
      receptionist: { id: "test", publicId: "test", name: config.title },
      booking: booking?.booking ? { id: booking.id, publicId: booking.publicId, name: booking.config.title, setup: booking.booking } : null,
      callerPhone: null,
    },
    deps,
  });
  if (turn.tokensIn + turn.tokensOut > 0) {
    await logAiUsage({ source: "receptionist_setup", model: RECEPTIONIST_MODEL, inputTokens: turn.tokensIn, outputTokens: turn.tokensOut });
  }
  return NextResponse.json({
    reply: turn.reply,
    note: turn.saved.length ? `Test only: the receptionist would have ${turn.saved.some((x) => x.outcome === "booked") ? "booked this appointment" : "saved this message"} and emailed you.` : null,
    costUsd: aiCostUsd(RECEPTIONIST_MODEL, turn.tokensIn, turn.tokensOut),
  });
}
