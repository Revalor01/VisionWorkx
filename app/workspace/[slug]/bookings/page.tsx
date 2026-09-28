import Link from "next/link";
import { requireWorkspace } from "@/lib/modules/workspace";
import { submissionEmail } from "@/lib/modules/submissionEmail";
import BookingsList, { type BookingRow } from "./BookingsList";

export default async function BookingsPage(props: { params: Promise<{ slug: string }> }) {
  const { slug } = await props.params;
  const { supabase, workspace, role } = await requireWorkspace(slug);
  // Server component rendered per request (reads the signed-in member): reading the clock here is intended.
  // eslint-disable-next-line react-hooks/purity
  const since = new Date(Date.now() - 2 * 86400e3).toISOString();
  // RLS: members only ever see their own workspace's bookings.
  const { data: rows } = await supabase
    .from("vw_bookings")
    .select("id, service_name, starts_at, ends_at, status, customer_tz, submission_id, vw_submissions(data)")
    .eq("workspace_id", workspace.id)
    .gte("starts_at", since)
    .order("starts_at", { ascending: true })
    .limit(500);
  const bookings: BookingRow[] = (rows ?? []).map((r) => {
    const sub = (Array.isArray(r.vw_submissions) ? r.vw_submissions[0] : r.vw_submissions) as { data?: Record<string, unknown> } | null;
    const data = sub?.data ?? {};
    return {
      id: r.id,
      serviceName: r.service_name,
      startsAt: r.starts_at,
      endsAt: r.ends_at,
      status: r.status,
      customerName: typeof data.name === "string" ? data.name : "",
      customerEmail: submissionEmail(data),
      customerPhone: typeof data.phone === "string" ? data.phone : "",
    };
  });
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-navy-dark">Bookings</h1>
          <p className="text-sm text-gray-500">Upcoming appointments, in your time zone ({workspace.time_zone.replace(/_/g, " ")}).</p>
        </div>
        {role === "owner" && (
          <Link href={`/workspace/${workspace.slug}/modules/new?type=booking`} className="text-sm font-semibold text-navy hover:underline">
            + New booking page
          </Link>
        )}
      </div>
      <BookingsList slug={workspace.slug} timeZone={workspace.time_zone} initial={bookings} canCancel={role === "owner"} />
    </div>
  );
}
