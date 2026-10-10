import type { requireWorkspace } from "@/lib/modules/workspace";

// Owner-page helpers for the receptionist setup (read with the member's own
// session, so RLS keeps it to their workspace).

type MemberClient = Awaited<ReturnType<typeof requireWorkspace>>["supabase"];

/** The workspace's booking modules, for the receptionist's "Book appointments with" picker. */
export async function bookingModulesFor(supabase: MemberClient, workspaceId: string): Promise<{ publicId: string; name: string; status: string }[]> {
  const { data } = await supabase
    .from("vw_modules")
    .select("public_id, name, status")
    .eq("workspace_id", workspaceId)
    .eq("type", "booking")
    .order("created_at");
  return (data ?? []).map((m) => ({ publicId: m.public_id, name: m.name, status: m.status }));
}

export interface VoicePanelData {
  /** The phone receptionist is switched on for this deployment. */
  enabled: boolean;
  phone: string | null;
  minutesUsed: number;
  minutesIncluded: number;
}

/** Phone number + this month's minutes for the setup page (member session; RLS-limited). */
export async function voicePanelFor(supabase: MemberClient, workspaceId: string, minutesIncluded: number, enabled: boolean, period: string): Promise<VoicePanelData> {
  const [{ data: number }, { data: usage }] = await Promise.all([
    supabase.from("vw_receptionist_numbers").select("phone_e164").eq("workspace_id", workspaceId).eq("status", "active").maybeSingle(),
    supabase.from("vw_receptionist_usage").select("voice_seconds").eq("workspace_id", workspaceId).eq("period", period).maybeSingle(),
  ]);
  return { enabled, phone: number?.phone_e164 ?? null, minutesUsed: Math.ceil((usage?.voice_seconds ?? 0) / 60), minutesIncluded };
}
