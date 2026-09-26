import { requireWorkspace } from "@/lib/modules/workspace";
import { modulesServiceClient } from "@/lib/modules/supabase";
import { currentPeriod, limitsFor, PLAN_PRICE, SUBMISSION_HARD_FACTOR, type ModulePlan } from "@/lib/modules/plans";
import { storageBytes, submissionsThisMonth } from "@/lib/modules/usage";
import { platformFeePercent } from "@/lib/modules/connect";
import BillingActions from "@/components/modules/BillingActions";
import ConnectPaymentsCard from "@/components/modules/ConnectPaymentsCard";

const STATUS: Record<string, { label: string; cls: string }> = {
  none: { label: "No plan yet", cls: "bg-gray-100 text-gray-700" },
  trialing: { label: "Free trial", cls: "bg-blue-50 text-blue-700" },
  active: { label: "Active", cls: "bg-emerald-50 text-emerald-700" },
  past_due: { label: "Payment problem", cls: "bg-amber-50 text-amber-800" },
  canceled: { label: "Cancelled", cls: "bg-red-50 text-red-700" },
  comped: { label: "Covered by Revalor", cls: "bg-emerald-50 text-emerald-700" },
};

function fmtBytes(n: number): string {
  if (n >= 1024 ** 3) return `${(n / 1024 ** 3).toFixed(1)} GB`;
  if (n >= 1024 ** 2) return `${(n / 1024 ** 2).toFixed(1)} MB`;
  return `${Math.round(n / 1024)} KB`;
}

function Meter({ label, used, limit, display }: { label: string; used: number; limit: number; display?: (n: number) => string }) {
  const pct = Math.min(100, Math.round((used / Math.max(1, limit)) * 100));
  const f = display ?? ((n: number) => n.toLocaleString());
  return (
    <div>
      <div className="flex items-baseline justify-between text-sm">
        <span className="font-medium text-gray-800">{label}</span>
        <span className="tabular-nums text-gray-600">
          {f(used)} of {f(limit)}
        </span>
      </div>
      <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-gray-100" role="progressbar" aria-label={label} aria-valuenow={used} aria-valuemin={0} aria-valuemax={limit}>
        <div className={`h-full ${pct >= 100 ? "bg-red-500" : pct >= 80 ? "bg-amber-500" : "bg-navy"}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export default async function WorkspaceBillingPage(props: { params: Promise<{ slug: string }>; searchParams: Promise<{ checkout?: string }> }) {
  const { slug } = await props.params;
  const { checkout } = await props.searchParams;
  const { workspace, role } = await requireWorkspace(slug);
  const db = modulesServiceClient();
  const [{ data: ws }, subs, bytes, { count: moduleCount }, { data: usage }] = await Promise.all([
    db.from("vw_workspaces").select("plan, billing_status, trial_ends_at, current_period_end, connect_payments_status").eq("id", workspace.id).single(),
    submissionsThisMonth(workspace.id),
    storageBytes(workspace.id),
    db.from("vw_modules").select("id", { count: "exact", head: true }).eq("workspace_id", workspace.id),
    db.from("vw_email_usage").select("sent_count").eq("workspace_id", workspace.id).eq("period", currentPeriod()).maybeSingle(),
  ]);
  const status = ws?.billing_status ?? "none";
  const plan = (ws?.plan ?? "starter") as ModulePlan;
  const limits = limitsFor(plan);
  const dateFmt = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeZone: workspace.time_zone });
  const trialDaysLeft = ws?.trial_ends_at ? Math.max(0, Math.ceil((new Date(ws.trial_ends_at).getTime() - Date.now()) / 864e5)) : null;

  return (
    <div className="max-w-4xl space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-navy-dark">Billing</h1>
        <p className="text-sm text-gray-500">Your plan, what&apos;s included, and how much you&apos;ve used this month.</p>
      </div>

      {checkout === "success" && (
        <p role="status" className="rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          You&apos;re all set — your plan will show here within a few seconds. Refresh if it doesn&apos;t.
        </p>
      )}
      {checkout === "cancelled" && (
        <p role="status" className="rounded-xl bg-gray-100 px-4 py-3 text-sm text-gray-700">Checkout was cancelled — nothing was charged.</p>
      )}

      <section className="rounded-2xl border border-gray-200 bg-white p-6" aria-labelledby="plan-h">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 id="plan-h" className="text-lg font-bold text-navy-dark">
              {status === "none" || status === "canceled" ? "Choose a plan" : `${PLAN_PRICE[plan].label} plan`}
            </h2>
            <p className="text-sm text-gray-600">
              {status === "trialing" && ws?.trial_ends_at && `Free trial — ${trialDaysLeft} day${trialDaysLeft === 1 ? "" : "s"} left. Your first charge is on ${dateFmt.format(new Date(ws.trial_ends_at))}.`}
              {status === "active" && ws?.current_period_end && `Renews on ${dateFmt.format(new Date(ws.current_period_end))}.`}
              {status === "past_due" && "We couldn't take your last payment. Update your card in Manage billing to keep your forms running."}
              {status === "canceled" && "Your plan has ended, so your forms are paused. Choose a plan to switch them back on."}
              {status === "none" && "Start with a 14-day free trial. Your forms go live as soon as it starts."}
              {status === "comped" && "This workspace is covered by Revalor."}
            </p>
          </div>
          <span className={`rounded-full px-3 py-1 text-sm font-semibold ${STATUS[status]?.cls ?? ""}`}>{STATUS[status]?.label ?? status}</span>
        </div>
        {role === "owner" && <BillingActions slug={workspace.slug} status={status} currentPlan={plan} />}
        {role !== "owner" && status !== "comped" && <p className="mt-4 text-sm text-gray-500">Only workspace owners can change billing.</p>}
      </section>

      {role === "owner" && (
        <ConnectPaymentsCard slug={workspace.slug} initialStatus={(ws?.connect_payments_status as "none" | "pending" | "active") ?? "none"} feePercent={platformFeePercent()} />
      )}

      <section className="space-y-4 rounded-2xl border border-gray-200 bg-white p-6" aria-labelledby="usage-h">
        <h2 id="usage-h" className="text-lg font-bold text-navy-dark">This month</h2>
        <Meter label="Submissions" used={subs} limit={limits.submissionsPerMonth} />
        <p className="-mt-2 text-xs text-gray-500">
          Over your plan? We keep saving up to {Math.round((SUBMISSION_HARD_FACTOR - 1) * 100)}% extra and email you, so you never lose a customer.
        </p>
        <Meter label="Automatic emails" used={usage?.sent_count ?? 0} limit={limits.emailsPerMonth} />
        <Meter label="Modules" used={moduleCount ?? 0} limit={limits.modules} />
        <Meter label="File storage" used={bytes} limit={limits.storageBytes} display={fmtBytes} />
        <p className="text-xs text-gray-500">AI form drafts: {limits.aiDraftsPerMonth} a month on your plan.</p>
      </section>
    </div>
  );
}
