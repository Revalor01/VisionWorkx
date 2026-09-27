import { redirect } from "next/navigation";
import { requireWorkspace } from "@/lib/modules/workspace";
import { parseBrand } from "@/lib/modules/config";
import SettingsForm from "@/components/modules/SettingsForm";
import CalendarSyncCard from "@/components/modules/CalendarSyncCard";
import { connectionStatus } from "@/lib/modules/googleCalendar";

export default async function WorkspaceSettingsPage(props: { params: Promise<{ slug: string }>; searchParams: Promise<{ calendar?: string }> }) {
  const { slug } = await props.params;
  const { calendar } = await props.searchParams;
  const { workspace, role } = await requireWorkspace(slug);
  if (role !== "owner") redirect(`/workspace/${slug}`);
  const calendarStatus = await connectionStatus(workspace.id);
  return (
    <div className="space-y-8">
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
      <CalendarSyncCard slug={workspace.slug} initial={calendarStatus} outcome={calendar} />
    </div>
  );
}
