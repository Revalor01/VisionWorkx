import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";
import { sendBillingEmail, lookupUserEmails } from "@/lib/billing/notify";

export const runtime = "nodejs";
export const maxDuration = 60;

// Daily: email anyone whose 14-day trial ends within ~3 days so the first
// charge isn't a surprise. Once per subscription (trial_ending_notified_at).
export async function GET(req: NextRequest) {
  if ((req.headers.get("authorization") ?? "") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const service = createServiceClient();
  const now = Date.now();
  const horizon = new Date(now + 3.5 * 86400_000).toISOString();

  const { data: subs } = await service
    .from("subscriptions")
    .select("id, user_id, plan, current_period_end, trial_ending_notified_at")
    .eq("status", "trialing")
    .is("trial_ending_notified_at", null)
    .not("current_period_end", "is", null)
    .lt("current_period_end", horizon)
    .limit(200);

  const due = (subs ?? []).filter(
    (s) => s.current_period_end && new Date(s.current_period_end).getTime() > now,
  );
  if (due.length === 0) return NextResponse.json({ notified: 0 });

  const emails = await lookupUserEmails(due.map((s) => s.user_id));
  let notified = 0;

  for (const s of due) {
    const to = emails[s.user_id];
    if (!to) continue;
    const endsOn = new Date(s.current_period_end as string).toLocaleDateString(undefined, {
      weekday: "long",
      month: "long",
      day: "numeric",
    });
    const planLabel = s.plan ? s.plan[0].toUpperCase() + s.plan.slice(1) : "your";
    const sent = await sendBillingEmail({
      to,
      subject: "Your Vision Workx trial ends soon",
      heading: `Your trial ends ${endsOn}`,
      body: [
        `Your free trial wraps up on ${endsOn}, and your ${planLabel} plan starts then so your apps stay live.`,
        "Nothing to do if you're staying — the card on file is charged automatically. Want to change plan or cancel? Do it before that date from your billing page.",
      ],
      ctaLabel: "Review billing",
    });
    if (sent) {
      await service
        .from("subscriptions")
        .update({ trial_ending_notified_at: new Date().toISOString() })
        .eq("id", s.id);
      notified++;
    }
  }

  return NextResponse.json({ notified, checked: due.length });
}
