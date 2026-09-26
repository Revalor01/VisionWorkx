import { requireWorkspace } from "@/lib/modules/workspace";
import SubmissionsBoard, { type SubmissionRow } from "@/components/modules/SubmissionsBoard";
import { parseFormConfig } from "@/lib/modules/config";
import { isQuoteModule, parseQuotePricing, quoteFieldDefs } from "@/lib/modules/quote";
import { bookingFieldDefs, isBookingModule } from "@/lib/modules/booking";

export default async function WorkspaceSubmissionsPage(props: { params: Promise<{ slug: string }> }) {
  const { slug } = await props.params;
  const { supabase, workspace } = await requireWorkspace(slug);

  const [{ data: subs }, { data: mods }] = await Promise.all([
    supabase
      .from("vw_submissions")
      .select("id, module_id, data, status, notes, source_url, created_at, payment_status, payment_amount_cents")
      .eq("workspace_id", workspace.id)
      .order("created_at", { ascending: false })
      .limit(500),
    supabase.from("vw_modules").select("id, name, type, config").eq("workspace_id", workspace.id),
  ]);

  const moduleNames: Record<string, string> = {};
  const fieldLabels: Record<string, Record<string, string>> = {};
  (mods ?? []).forEach((m) => {
    moduleNames[m.id] = m.name;
    const quote = isQuoteModule(m.type) ? parseQuotePricing((m.config as { quote?: unknown } | null)?.quote) : null;
    fieldLabels[m.id] = Object.fromEntries([
      ...(quote ? quoteFieldDefs(quote).map((f) => [f.id, f.label]) : []),
      ...(isBookingModule(m.type) ? bookingFieldDefs().map((f) => [f.id, f.label]) : []),
      ...parseFormConfig(m.config).fields.map((f) => [f.id, f.label]),
    ]);
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
