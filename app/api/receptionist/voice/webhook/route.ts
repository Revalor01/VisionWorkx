import { NextRequest, NextResponse } from "next/server";
import { modulesConfigured, modulesServiceClient } from "@/lib/modules/supabase";
import { createLead } from "@/lib/receptionist/lead";
import { RECEPTIONIST_FIELDS } from "@/lib/receptionist/config";
import { realToolDeps } from "@/lib/receptionist/server";
import { voiceEnabled } from "@/lib/receptionist/voice/provider";
import { provider, receptionistForNumber, recordVoiceUsage, voiceConversation } from "@/lib/receptionist/voice/server";
import { callOutcome, callTranscript, type RetellCall } from "@/lib/receptionist/voice/calls";

// Retell's call webhooks for the phone receptionist (signed with the Retell
// API key). `call_ended`: store duration, cost and transcript, and add the
// minutes to the month (once, even if Retell retries). `call_analyzed`: store
// Retell's summary and, if the caller spoke but nothing was saved during the
// call, save the summary as a lead so the owner never misses a caller.

export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(req: NextRequest) {
  const raw = await req.text();
  if (!voiceEnabled() || !modulesConfigured()) return NextResponse.json({ ok: true });
  if (!(await provider().verify(raw, req.headers.get("x-retell-signature")))) {
    return NextResponse.json({ error: "Bad signature" }, { status: 401 });
  }
  let body: { event?: string; call?: RetellCall };
  try {
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  const call = body.call;
  if (!call?.call_id || typeof call.to_number !== "string" || (body.event !== "call_ended" && body.event !== "call_analyzed")) {
    return NextResponse.json({ ok: true }); // other events are ignored
  }
  const found = await receptionistForNumber(call.to_number);
  if (!found) return NextResponse.json({ ok: true });
  const { mod } = found;
  const db = modulesServiceClient();
  const conv = await voiceConversation(call.call_id, mod, call.from_number ?? null);

  if (body.event === "call_ended") {
    const { data: existing } = await db.from("vw_receptionist_calls").select("ended_at, outcome").eq("provider_call_id", call.call_id).single();
    if (existing?.ended_at) return NextResponse.json({ ok: true }); // a retry — already recorded
    const seconds = Math.max(0, Math.round((call.duration_ms ?? 0) / 1000));
    const transcript = callTranscript(call);
    await db
      .from("vw_receptionist_calls")
      .update({
        duration_seconds: seconds,
        cost_usd: Number(((call.call_cost?.combined_cost ?? 0) / 100).toFixed(4)),
        outcome: callOutcome(call, existing?.outcome ?? null),
        started_at: call.start_timestamp ? new Date(call.start_timestamp).toISOString() : undefined,
        ended_at: new Date(call.end_timestamp ?? Date.now()).toISOString(),
      })
      .eq("provider_call_id", call.call_id);
    if (transcript.length) {
      await db.from("vw_receptionist_messages").insert(transcript.map((m) => ({ conversation_id: conv.conversationId, workspace_id: mod.workspaceId, ...m })));
      await db
        .from("vw_receptionist_conversations")
        .update({ message_count: transcript.length, last_at: new Date().toISOString() })
        .eq("id", conv.conversationId);
    }
    await recordVoiceUsage(mod, seconds);
    return NextResponse.json({ ok: true });
  }

  // call_analyzed
  const summary = call.call_analysis?.call_summary?.trim().slice(0, 2000) || null;
  if (summary) await db.from("vw_receptionist_calls").update({ summary }).eq("provider_call_id", call.call_id);
  const callerSpoke = callTranscript(call).some((m) => m.role === "visitor");
  if (!conv.submissionId && callerSpoke) {
    // Nothing was saved during the call: save the summary as a message, at most once per call.
    const deps = realToolDeps(mod.workspaceName, call.call_id);
    if (await deps.claimSave("message")) {
      const lead = await createLead({
        workspaceId: mod.workspaceId,
        workspaceName: mod.workspaceName,
        plan: mod.plan,
        moduleId: mod.id,
        modulePublicId: mod.publicId,
        moduleType: "receptionist",
        moduleName: mod.config.title || "AI receptionist",
        values: {
          name: "Phone caller",
          ...(call.from_number ? { phone: call.from_number } : {}),
          message: summary ?? "The caller didn't leave details. See the conversation.",
          channel: "Phone call (AI receptionist)",
        },
        fields: RECEPTIONIST_FIELDS.map((f) => ({ id: f.id, label: f.label, type: f.type })),
        sourceUrl: null,
      });
      if (lead.ok) {
        await db.from("vw_receptionist_conversations").update({ submission_id: lead.submissionId }).eq("id", conv.conversationId);
      }
    }
  }
  return NextResponse.json({ ok: true });
}
