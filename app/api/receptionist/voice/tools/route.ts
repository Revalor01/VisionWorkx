import { NextRequest, NextResponse } from "next/server";
import { modulesConfigured, modulesServiceClient } from "@/lib/modules/supabase";
import { billingAllowsService } from "@/lib/modules/plans";
import { linkedBooking, realToolDeps, toolContext } from "@/lib/receptionist/server";
import { runTool, TOOL_NAMES } from "@/lib/receptionist/tools";
import { voiceEnabled } from "@/lib/receptionist/voice/provider";
import { provider, receptionistForNumber, voiceConversation } from "@/lib/receptionist/voice/server";

// Retell calls this mid-call when the phone receptionist uses a tool (check
// availability, book, take a message). Same tool code as chat; the workspace
// comes from the DIALLED number (never from the model). Signed with the Retell
// API key. The plain-text response is read back to the model.

export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(req: NextRequest) {
  const raw = await req.text();
  if (!voiceEnabled() || !modulesConfigured()) return new NextResponse("The phone assistant isn't available. Offer to take a message.", { status: 503 });
  if (!(await provider().verify(raw, req.headers.get("x-retell-signature")))) {
    return NextResponse.json({ error: "Bad signature" }, { status: 401 });
  }
  let body: { name?: unknown; args?: unknown; call?: { call_id?: string; to_number?: string; from_number?: string } };
  try {
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  const name = typeof body.name === "string" ? body.name : "";
  const callId = body.call?.call_id;
  if (!(TOOL_NAMES as readonly string[]).includes(name) || !callId || typeof body.call?.to_number !== "string") {
    return new NextResponse("Unknown tool.", { status: 200 });
  }
  const found = await receptionistForNumber(body.call.to_number);
  if (!found || found.mod.status !== "live" || !billingAllowsService(found.mod.billingStatus)) {
    return new NextResponse("This line isn't available. Apologise and end the call.", { status: 200 });
  }
  const { mod } = found;
  const from = typeof body.call.from_number === "string" ? body.call.from_number : null;

  const booking = await linkedBooking(mod);
  const result = await runTool(
    name,
    (body.args && typeof body.args === "object" ? body.args : {}) as Record<string, unknown>,
    toolContext(mod, booking, "voice", null, from),
    realToolDeps(mod.workspaceName, callId),
  );

  // Link what was saved to this call's conversation, and remember the outcome.
  if (result.submissionId) {
    const conv = await voiceConversation(callId, mod, from);
    const db = modulesServiceClient();
    await Promise.all([
      db.from("vw_receptionist_conversations").update({ submission_id: result.submissionId, last_at: new Date().toISOString() }).eq("id", conv.conversationId),
      db.from("vw_receptionist_calls").update({ outcome: result.outcome }).eq("provider_call_id", callId),
    ]);
  }
  return new NextResponse(result.content, { status: 200, headers: { "Content-Type": "text/plain; charset=utf-8" } });
}
