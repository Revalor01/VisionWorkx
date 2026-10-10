import { NextRequest, NextResponse } from "next/server";
import { modulesConfigured } from "@/lib/modules/supabase";
import { voiceEnabled } from "@/lib/receptionist/voice/provider";
import { CAPPED_CALL_MS, inboundDecision, provider } from "@/lib/receptionist/voice/server";

// Retell calls this for every inbound call before it rings through. We decide
// whether the receptionist answers (workspace live and paying) and pass the
// per-call variables: the current local time, and — once the month's minutes
// are used up — a note that limits the call to taking a short message, with a
// short call length. Past 120% of the minutes, and above the per-number /
// per-caller call rate limits, calls are refused (see inboundDecision). Signed with the Retell API key; anything unsigned is refused.

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const raw = await req.text();
  if (!voiceEnabled() || !modulesConfigured()) return NextResponse.json({ call_inbound: { reject: true } });
  if (!(await provider().verify(raw, req.headers.get("x-retell-signature")))) {
    return NextResponse.json({ error: "Bad signature" }, { status: 401 });
  }
  let body: { event?: string; call_inbound?: { to_number?: string; from_number?: string } };
  try {
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  if (body.event !== "call_inbound" || typeof body.call_inbound?.to_number !== "string") {
    return NextResponse.json({ call_inbound: { reject: true } });
  }
  const from = typeof body.call_inbound.from_number === "string" ? body.call_inbound.from_number : null;
  const d = await inboundDecision(body.call_inbound.to_number, from);
  if (d.reject) return NextResponse.json({ call_inbound: { reject: true } });
  return NextResponse.json({
    call_inbound: {
      dynamic_variables: d.dynamicVariables,
      metadata: d.metadata,
      // Over the plan's minutes: a short message-taking call only.
      ...(d.capped ? { agent_override: { agent: { max_call_duration_ms: CAPPED_CALL_MS } } } : {}),
    },
  });
}
