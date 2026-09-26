import { redirect } from "next/navigation";
import { requireWorkspace } from "@/lib/modules/workspace";
import { parseBrand } from "@/lib/modules/config";
import SettingsForm from "@/components/modules/SettingsForm";

export default async function WorkspaceSettingsPage(props: { params: Promise<{ slug: string }> }) {
  const { slug } = await props.params;
  const { workspace, role } = await requireWorkspace(slug);
  if (role !== "owner") redirect(`/workspace/${slug}`);
  return (
    <SettingsForm
      workspace={{
        id: workspace.id,
        slug: workspace.slug,
        name: workspace.name,
        domains: workspace.domains,
        brand: parseBrand(workspace.brand),
        logoUrl: workspace.logo_url ?? "",
        notificationEmail: workspace.notification_email ?? "",
        timeZone: workspace.time_zone,
        webhookUrl: workspace.webhook_url ?? "",
      }}
    />
  );
}
