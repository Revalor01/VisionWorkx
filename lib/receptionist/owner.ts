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
