import { getModuleByPublicId, type PublicModule } from "@/lib/modules/data";
import { modulesServiceClient } from "@/lib/modules/supabase";
import { busyRanges, manageUrl, reserveSlot, scheduleReminder, syncNewBookingToCalendar } from "@/lib/modules/bookingServer";
import { currentPeriod } from "@/lib/modules/plans";
import { submissionEmail } from "@/lib/modules/submissionEmail";
import { createLead } from "./lead";
import { buildSystemPrompt, type Channel } from "./prompt";
import type { ToolContext, ToolDeps } from "./tools";

// Server wiring shared by the chat route (and the voice routes): the real tool
// side effects, the linked booking module, the system prompt and the usage
// counter. Server-only (service role).

/** The receptionist's linked booking module, only if it's a live booking module in the SAME workspace. */
export async function linkedBooking(mod: PublicModule): Promise<PublicModule | null> {
  const id = mod.receptionist?.bookingModuleId;
  if (!id) return null;
  const b = await getModuleByPublicId(id);
  if (!b || b.workspaceId !== mod.workspaceId || b.type !== "booking" || b.status !== "live" || !b.booking || b.booking.services.length === 0) return null;
  return b;
}

export function nowText(timeZone: string, now = new Date()): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(now);
}

export function toolContext(mod: PublicModule, booking: PublicModule | null, channel: Channel, sourceUrl: string | null, callerPhone: string | null = null): ToolContext {
  return {
    channel,
    workspaceId: mod.workspaceId,
    plan: mod.plan,
    workspaceName: mod.workspaceName,
    sourceUrl,
    receptionist: { id: mod.id, publicId: mod.publicId, name: mod.config.title || "AI receptionist" },
    booking: booking?.booking ? { id: booking.id, publicId: booking.publicId, name: booking.config.title || "Online booking", setup: booking.booking } : null,
    callerPhone,
  };
}

export function systemPromptFor(mod: PublicModule, booking: PublicModule | null, channel: Channel, timeZone: string): string {
  return buildSystemPrompt({
    businessName: mod.workspaceName,
    setup: mod.receptionist!,
    channel,
    timeZone,
    services: booking?.booking?.services ?? [],
    nowText: nowText(timeZone),
  });
}

/**
 * `conversationKey` scopes the save caps (a chat conversation id, or a phone
 * call id): one booking and one message each, enforced in the database.
 */
export function realToolDeps(businessName: string, conversationKey: string): ToolDeps {
  const db = () => modulesServiceClient();
  return {
    now: () => new Date(),
    claimSave: async (kind) => {
      const { data } = await db().rpc("vw_rate_check", { p_key: `rsave:${kind}:${conversationKey}`, max_hits: 1, window_seconds: 7 * 86400 });
      return data !== false;
    },
    busyRanges: (ws, from, to) => busyRanges(ws, from, to),
    reserveSlot,
    createLead,
    manageUrl,
    cancelReservation: async (bookingId) => {
      await db().from("vw_bookings").update({ status: "cancelled", cancelled_at: new Date().toISOString() }).eq("id", bookingId);
    },
    afterBooking: async ({ bookingId, submissionId, token, start, service, setup, values }) => {
      const { data: b } = await db().from("vw_bookings").update({ submission_id: submissionId }).eq("id", bookingId).select("workspace_id, module_id").single();
      if (b) {
        await scheduleReminder({
          bookingId,
          workspaceId: b.workspace_id,
          moduleId: b.module_id,
          submissionId,
          businessName,
          start,
          setup,
          customerTz: null,
          serviceName: service.name,
          to: submissionEmail(values),
          customerName: values.name ?? "",
          token,
        });
      }
      syncNewBookingToCalendar(bookingId);
    },
  };
}

/** Adds to this month's receptionist usage atomically; returns the new totals (null on error). */
export async function addUsage(workspaceId: string, chats: number, voiceSeconds: number): Promise<{ chats: number; voice_seconds: number } | null> {
  const { data, error } = await modulesServiceClient().rpc("vw_receptionist_add_usage", {
    p_workspace: workspaceId,
    p_period: currentPeriod(),
    p_chats: chats,
    p_voice_seconds: voiceSeconds,
  });
  if (error) {
    console.error("[receptionist] usage update failed:", error.code);
    return null;
  }
  const row = Array.isArray(data) ? data[0] : data;
  return row ? { chats: Number(row.chats), voice_seconds: Number(row.voice_seconds) } : null;
}

/** This month's usage so far (zeros when there's no row yet). */
export async function usageThisMonth(workspaceId: string): Promise<{ chats: number; voice_seconds: number }> {
  const { data } = await modulesServiceClient()
    .from("vw_receptionist_usage")
    .select("chats, voice_seconds")
    .eq("workspace_id", workspaceId)
    .eq("period", currentPeriod())
    .maybeSingle();
  return { chats: data?.chats ?? 0, voice_seconds: data?.voice_seconds ?? 0 };
}
