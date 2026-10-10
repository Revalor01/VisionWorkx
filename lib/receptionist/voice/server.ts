import { getModuleByPublicId, type PublicModule } from "@/lib/modules/data";
import { modulesServiceClient } from "@/lib/modules/supabase";
import { billingAllowsService, limitsFor, voiceAlert, voiceAllowed } from "@/lib/modules/plans";
import { sendUsageAlert } from "@/lib/modules/usage";
import { addUsage, linkedBooking, nowText, usageThisMonth } from "../server";
import { retellProvider } from "./retell";
import type { AgentSpec, VoiceProvider } from "./provider";

// Server wiring for the phone receptionist: which workspace a number belongs
// to, the per-call minutes cap, agent sync when the owner edits the facts,
// and usage after each call. Server-only (service role).

export interface NumberRow {
  id: string;
  workspace_id: string;
  module_id: string;
  phone_e164: string;
  provider_agent_id: string | null;
  status: string;
}

export function provider(): VoiceProvider {
  return retellProvider();
}

/** The active number row and its receptionist module for a dialled number (null if unknown). */
export async function receptionistForNumber(phone: string): Promise<{ number: NumberRow; mod: PublicModule } | null> {
  if (!/^\+1[0-9]{10}$/.test(phone)) return null;
  const db = modulesServiceClient();
  const { data: number } = await db
    .from("vw_receptionist_numbers")
    .select("id, workspace_id, module_id, phone_e164, provider_agent_id, status")
    .eq("phone_e164", phone)
    .eq("status", "active")
    .maybeSingle();
  if (!number) return null;
  const { data: m } = await db.from("vw_modules").select("public_id").eq("id", number.module_id).maybeSingle();
  const mod = m ? await getModuleByPublicId(m.public_id) : null;
  if (!mod || mod.workspaceId !== number.workspace_id || mod.type !== "receptionist" || !mod.receptionist) return null;
  return { number: number as NumberRow, mod };
}

export async function agentSpecFor(mod: PublicModule): Promise<AgentSpec> {
  const booking = await linkedBooking(mod);
  return { businessName: mod.workspaceName, setup: mod.receptionist!, timeZone: mod.timeZone, services: booking?.booking?.services ?? [] };
}

export const LIMIT_NOTE =
  "IMPORTANT: this business's phone minutes for the month are used up. Don't book or chat at length: politely take a message (name, phone number, what they need) with take_message, then say goodbye and end the call within about a minute.";

export type InboundDecision = { reject: true } | { reject: false; dynamicVariables: Record<string, string>; metadata: Record<string, string> };

/** Decides, before the phone rings through, whether and how the receptionist answers. */
export async function inboundDecision(toNumber: string, now = new Date()): Promise<InboundDecision> {
  const found = await receptionistForNumber(toNumber);
  if (!found || found.mod.status !== "live" || !billingAllowsService(found.mod.billingStatus)) return { reject: true };
  const usage = await usageThisMonth(found.mod.workspaceId);
  const capped = !voiceAllowed(usage.voice_seconds, limitsFor(found.mod.plan).voiceMinutesPerMonth);
  return {
    reject: false,
    dynamicVariables: { now_text: nowText(found.mod.timeZone, now), limit_note: capped ? LIMIT_NOTE : "" },
    metadata: { workspace_id: found.mod.workspaceId, module_id: found.mod.id },
  };
}

/** Pushes the latest facts to the workspace's phone agent (after the owner saves). No-op without a number. */
export async function syncVoiceAgent(publicId: string): Promise<void> {
  const mod = await getModuleByPublicId(publicId);
  if (!mod || mod.type !== "receptionist" || !mod.receptionist) return;
  const { data: number } = await modulesServiceClient()
    .from("vw_receptionist_numbers")
    .select("provider_agent_id")
    .eq("module_id", mod.id)
    .eq("status", "active")
    .maybeSingle();
  if (!number?.provider_agent_id) return;
  await provider().syncAgent(await agentSpecFor(mod), number.provider_agent_id);
}

/** Adds a finished call's seconds to the month and sends the 80%/100% alerts once. */
export async function recordVoiceUsage(mod: PublicModule, seconds: number): Promise<void> {
  if (seconds <= 0) return;
  const before = (await usageThisMonth(mod.workspaceId)).voice_seconds;
  const after = await addUsage(mod.workspaceId, 0, seconds);
  if (!after) return;
  const alert = voiceAlert(before, after.voice_seconds, limitsFor(mod.plan).voiceMinutesPerMonth);
  if (alert) {
    await sendUsageAlert({ id: mod.workspaceId, name: mod.workspaceName, slug: mod.workspaceSlug, plan: mod.plan, notification_email: mod.notificationEmail }, alert);
  }
}

/** The conversation row for a phone call (created on first use; keyed by the provider's call id). */
export async function voiceConversation(callId: string, mod: PublicModule, fromNumber: string | null): Promise<{ conversationId: string; submissionId: string | null }> {
  const db = modulesServiceClient();
  const { data: call } = await db
    .from("vw_receptionist_calls")
    .select("conversation_id")
    .eq("provider_call_id", callId)
    .maybeSingle();
  if (call?.conversation_id) {
    const { data: conv } = await db.from("vw_receptionist_conversations").select("id, submission_id").eq("id", call.conversation_id).single();
    if (conv) return { conversationId: conv.id, submissionId: conv.submission_id };
  }
  const { data: conv, error } = await db
    .from("vw_receptionist_conversations")
    .insert({ workspace_id: mod.workspaceId, module_id: mod.id, channel: "voice" })
    .select("id")
    .single();
  if (error || !conv) throw new Error(`voice conversation insert failed: ${error?.code}`);
  const { error: upErr } = await db
    .from("vw_receptionist_calls")
    .upsert(
      { provider_call_id: callId, workspace_id: mod.workspaceId, conversation_id: conv.id, from_number: fromNumber?.slice(0, 20) ?? null },
      { onConflict: "provider_call_id" },
    );
  if (upErr) throw new Error(`voice call upsert failed: ${upErr.code}`);
  return { conversationId: conv.id, submissionId: null };
}
