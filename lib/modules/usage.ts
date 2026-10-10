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
  // AI receptionist limits (chat is a soft limit like submissions; voice is a hard stop).
  chats_80: (plan, n) => ({
    subject: "You've used 80% of this month's AI receptionist chats",
    text: `Your ${plan} plan includes ${n.toLocaleString()} AI receptionist chats a month, and you've used 80% so far.\n\nNothing has stopped — your receptionist keeps answering. If you expect more this month, you can upgrade any time from your workspace's Billing page.`,
  }),
  chats_100: (plan, n) => ({
    subject: "You've reached this month's AI receptionist chats",
    text: `Your ${plan} plan includes ${n.toLocaleString()} AI receptionist chats a month, and you've now reached that.\n\nYour receptionist is still answering — we'll keep going up to 50% over your plan — but please upgrade from your workspace's Billing page to stay covered.`,
  }),
  chats_150: (plan, n) => ({
    subject: "Your AI receptionist chat is paused for the rest of the month",
    text: `Your ${plan} plan includes ${n.toLocaleString()} AI receptionist chats a month. You're now 50% over, so new visitors see "please contact us directly" instead of the chat.\n\nUpgrade from your workspace's Billing page and it starts working again straight away.`,
  }),
  voice_80: (plan, n) => ({
    subject: "You've used 80% of this month's AI receptionist phone minutes",
    text: `Your ${plan} plan includes ${n.toLocaleString()} AI receptionist phone minutes a month, and you've used 80% so far.\n\nWhen you reach 100%, calls are answered with a short "please leave a message" instead of the full receptionist until next month. Upgrade from your workspace's Billing page for more minutes.`,
  }),
  voice_100: (plan, n) => ({
    subject: "You've used all of this month's AI receptionist phone minutes",
    text: `Your ${plan} plan includes ${n.toLocaleString()} AI receptionist phone minutes a month, and you've now used them all.\n\nUntil next month, callers hear a short "please leave a message" and you'll get their details by email. Upgrade from your workspace's Billing page to turn the full receptionist back on.`,
  }),
};

/** The plan amount each alert kind talks about. */
function includedFor(kind: string, plan: string): number {
  const l = limitsFor(plan);
  if (kind.startsWith("chats_")) return l.chatsPerMonth;
  if (kind.startsWith("voice_")) return l.voiceMinutesPerMonth;
  return l.submissionsPerMonth;
}

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
  const copy = ALERT_COPY[kind](plan, includedFor(kind, ws.plan));
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
