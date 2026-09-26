import { requireWorkspace } from "@/lib/modules/workspace";
import { currentPeriod as currentAutomationPeriod, limitsFor } from "@/lib/modules/plans";
import { DEFAULT_EMAILS, EMAIL_KINDS } from "@/lib/modules/emailDefaults";
import EmailSettings from "@/components/modules/EmailSettings";

const STATUS: Record<string, { label: string; cls: string }> = {
  sent: { label: "Sent", cls: "bg-emerald-50 text-emerald-700" },
  failed: { label: "Failed", cls: "bg-red-50 text-red-700" },
  skipped_limit: { label: "Over monthly limit", cls: "bg-amber-50 text-amber-800" },
  suppressed: { label: "Unsubscribed / blocked", cls: "bg-gray-100 text-gray-600" },
  bounced: { label: "Bounced", cls: "bg-red-50 text-red-700" },
  complained: { label: "Marked as spam", cls: "bg-red-50 text-red-700" },
};
const KIND: Record<string, string> = {
  customer_confirmation: "Confirmation",
  owner_alert: "Alert to you",
  follow_up: "Follow-up",
  reminder: "Reminder",
  review_request: "Review request",
};

export default async function WorkspaceEmailsPage(props: { params: Promise<{ slug: string }> }) {
  const { slug } = await props.params;
  const { supabase, workspace, role } = await requireWorkspace(slug);
  const period = currentAutomationPeriod();
  const [{ data: usage }, { data: log }, templatesRes] = await Promise.all([
    supabase.from("vw_email_usage").select("sent_count").eq("workspace_id", workspace.id).eq("period", period).maybeSingle(),
    supabase
      .from("vw_email_log")
      .select("id, kind, to_email, subject, status, error, created_at")
      .eq("workspace_id", workspace.id)
      .order("created_at", { ascending: false })
      .limit(100),
    role === "owner"
      ? supabase.from("vw_email_templates").select("kind, subject, body, enabled, delay_hours").eq("workspace_id", workspace.id).is("module_id", null)
      : Promise.resolve({ data: [] as { kind: string; subject: string; body: string; enabled: boolean; delay_hours: number }[] }),
  ]);
  const limit = limitsFor(workspace.plan).emailsPerMonth;
  const sent = usage?.sent_count ?? 0;
  const pct = Math.min(100, Math.round((sent / limit) * 100));
  const fmt = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: workspace.time_zone });
  const saved = Object.fromEntries((templatesRes.data ?? []).map((t) => [t.kind, t]));
  const initial = Object.fromEntries(
    EMAIL_KINDS.map((k) => [
      k,
      saved[k]
        ? { subject: saved[k].subject, body: saved[k].body, enabled: saved[k].enabled, delayHours: saved[k].delay_hours || DEFAULT_EMAILS[k].delayHours }
        : DEFAULT_EMAILS[k],
    ]),
  );

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-navy-dark">Emails</h1>
        <p className="text-sm text-gray-500">
          Every submission sends your customer a confirmation and you an alert — automatically, from your business name.
        </p>
      </div>

      <section className="rounded-2xl border border-gray-200 bg-white p-5" aria-labelledby="usage-h">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="usage-h" className="font-bold text-gray-900">This month</h2>
          <p className="text-sm text-gray-600 tabular-nums">
            <strong>{sent}</strong> of {limit.toLocaleString()} emails · {workspace.plan} plan
          </p>
        </div>
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-gray-100" role="progressbar" aria-valuenow={sent} aria-valuemin={0} aria-valuemax={limit} aria-label="Emails used this month">
          <div className={`h-full ${pct >= 90 ? "bg-amber-500" : "bg-navy"}`} style={{ width: `${pct}%` }} />
        </div>
        {pct >= 100 && <p className="mt-2 text-sm text-amber-800">You&apos;ve reached this month&apos;s limit, so new emails are paused until next month. Your submissions are still saved.</p>}
      </section>

      {role === "owner" && <EmailSettings slug={workspace.slug} initial={initial} />}

      <section aria-labelledby="log-h">
        <h2 id="log-h" className="mb-3 font-bold text-gray-900">Recent emails</h2>
        {(log ?? []).length === 0 ? (
          <p className="rounded-2xl border border-dashed border-gray-300 bg-white p-8 text-center text-gray-600">No emails sent yet.</p>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-gray-200 bg-white">
            <table className="w-full min-w-[560px] text-sm">
              <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="px-4 py-3 font-semibold">When</th>
                  <th className="px-4 py-3 font-semibold">Type</th>
                  <th className="px-4 py-3 font-semibold">To</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                </tr>
              </thead>
              <tbody>
                {(log ?? []).map((r) => (
                  <tr key={r.id} className="border-t border-gray-100">
                    <td className="px-4 py-3 whitespace-nowrap tabular-nums text-gray-600">{fmt.format(new Date(r.created_at))}</td>
                    <td className="px-4 py-3">
                      <div className="font-medium text-gray-900">{KIND[r.kind] ?? r.kind}</div>
                      {r.subject && <div className="max-w-xs truncate text-xs text-gray-500">{r.subject}</div>}
                    </td>
                    <td className="px-4 py-3 text-gray-700">{r.to_email}</td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS[r.status]?.cls ?? ""}`} title={r.error ?? ""}>
                        {STATUS[r.status]?.label ?? r.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
