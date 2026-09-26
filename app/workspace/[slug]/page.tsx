import { requireWorkspace } from "@/lib/modules/workspace";
import SubmissionsBoard, { type SubmissionRow } from "@/components/modules/SubmissionsBoard";
import { parseFormConfig } from "@/lib/modules/config";

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
    supabase.from("vw_modules").select("id, name, type, config").eq("workspace_id", workspace.id),
  ]);

  const moduleNames: Record<string, string> = {};
  const fieldLabels: Record<string, Record<string, string>> = {};
  (mods ?? []).forEach((m) => {
    moduleNames[m.id] = m.name;
    fieldLabels[m.id] = Object.fromEntries(parseFormConfig(m.config).fields.map((f) => [f.id, f.label]));
  });

  return (
    <SubmissionsBoard
      workspaceId={workspace.id}
      slug={workspace.slug}
      timeZone={workspace.time_zone}
      moduleNames={moduleNames}
      fieldLabels={fieldLabels}
      initial={(subs ?? []) as SubmissionRow[]}
    />
  );
}
