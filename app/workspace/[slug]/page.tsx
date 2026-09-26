import { requireWorkspace } from "@/lib/modules/workspace";
import SubmissionsBoard, { type SubmissionRow } from "@/components/modules/SubmissionsBoard";

export default async function WorkspaceSubmissionsPage(props: { params: Promise<{ slug: string }> }) {
  const { slug } = await props.params;
  const { supabase, workspace } = await requireWorkspace(slug);

  const [{ data: subs }, { data: mods }] = await Promise.all([
    supabase
      .from("vw_submissions")
      .select("id, module_id, data, status, notes, source_url, created_at")
      .eq("workspace_id", workspace.id)
      .order("created_at", { ascending: false })
      .limit(500),
    supabase.from("vw_modules").select("id, name, type").eq("workspace_id", workspace.id),
  ]);

  const moduleNames: Record<string, string> = {};
  (mods ?? []).forEach((m) => (moduleNames[m.id] = m.name));

  return (
    <SubmissionsBoard
      workspaceId={workspace.id}
      slug={workspace.slug}
      timeZone={workspace.time_zone}
      moduleNames={moduleNames}
      initial={(subs ?? []) as SubmissionRow[]}
    />
  );
}
