import { modulesServiceClient } from "./supabase";
import { currentPeriod, limitsFor, monthStartIso, PLAN_PRICE, type ModulePlan } from "./plans";

// Server-side usage lookups + the once-per-month limit warning emails.

export async function submissionsThisMonth(workspaceId: string): Promise<number> {
  const { count } = await modulesServiceClient()
    .from("vw_submissions")
    .select("id", { count: "exact", head: true })
    .eq("workspace_id", workspaceId)
    .gte("created_at", monthStartIso());
  return count ?? 0;
}

export async function storageBytes(workspaceId: string): Promise<number> {
  const { data } = await modulesServiceClient().rpc("vw_workspace_storage_bytes", { p_workspace: workspaceId });
  return typeof data === "number" ? data : Number(data ?? 0);
}

const ALERT_COPY: Record<string, (plan: string, included: number) => { subject: string; text: string }> = {
  submissions_80: (plan, n) => ({
    subject: "You've used 80% of this month's VisionWorkx submissions",
    text: `Your ${plan} plan includes ${n.toLocaleString()} submissions a month, and you've used 80% so far.\n\nNothing has stopped — your forms keep working. If you expect more this month, you can upgrade any time from your workspace's Billing page.`,
  }),
  submissions_100: (plan, n) => ({
    subject: "You've reached this month's VisionWorkx submissions",
    text: `Your ${plan} plan includes ${n.toLocaleString()} submissions a month, and you've now reached that.\n\nYour forms are still working — we'll keep saving submissions up to 50% over your plan so you don't lose any customers — but please upgrade from your workspace's Billing page to stay covered.`,
  }),
  submissions_150: (plan, n) => ({
    subject: "Your VisionWorkx forms are paused for the rest of the month",
    text: `Your ${plan} plan includes ${n.toLocaleString()} submissions a month. You're now 50% over, so your forms are showing visitors a "temporarily unavailable — please contact us directly" message.\n\nUpgrade from your workspace's Billing page and they'll start working again straight away.`,
  }),
};

/** Sends a limit warning to the workspace's alert email, at most once per kind per month. */
export async function sendUsageAlert(
  ws: { id: string; name: string; slug: string; plan: string; notification_email: string | null },
  kind: keyof typeof ALERT_COPY,
): Promise<void> {
  if (!ws.notification_email) return;
  const db = modulesServiceClient();
  const { error: dup } = await db.from("vw_usage_alerts").insert({ workspace_id: ws.id, period: currentPeriod(), kind });
  if (dup) return; // already sent this month (primary key)
  const plan = PLAN_PRICE[(ws.plan as ModulePlan) ?? "starter"]?.label ?? ws.plan;
  const copy = ALERT_COPY[kind](plan, limitsFor(ws.plan).submissionsPerMonth);
  const billingUrl = `https://modules.revalorllc.com/workspace/${ws.slug}/billing`;
  const key = process.env.RESEND_API_KEY;
  if (!key) return;
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: "VisionWorkx <notifications@notify.revalorllc.com>",
      to: [ws.notification_email],
      subject: copy.subject,
      text: `Hi ${ws.name},\n\n${copy.text}\n\nBilling: ${billingUrl}\n\n— VisionWorkx`,
    }),
  });
  if (!res.ok) console.error("[usage-alert] send failed:", res.status);
}
