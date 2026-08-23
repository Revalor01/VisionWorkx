// Reuses the raw-fetch Resend pattern already used in app/api/deploy/route.ts
// and lib/promote/email.ts — staying consistent with the existing pattern
// rather than introducing a second way to send mail.

const RESEND_KEY = process.env.RESEND_API_KEY;
const ALERT_TO = "sawilliams721@gmail.com";
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://vision-workx.vercel.app";

const KIND_LABELS: Record<string, string> = {
  banned_word: "Banned word caught",
  high_risk: "High-risk content flagged",
  publish_failure: "Publish failed",
  inbox_escalation: "Message needs a human reply",
};

// Fire-and-forget by design — an email failure must never block the
// flag/pause logic that calls this.
export async function sendAutonomyAlert(params: { brandName: string; kind: keyof typeof KIND_LABELS; detail: string }): Promise<void> {
  if (!RESEND_KEY) {
    console.error("[social/alerts] RESEND_API_KEY not configured, skipping alert:", params);
    return;
  }

  const label = KIND_LABELS[params.kind] ?? params.kind;

  await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RESEND_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: "Revalor Social Media <social@notify.revalorllc.com>",
      to: [ALERT_TO],
      subject: `[Social Autonomy] ${params.brandName} needs your input — ${label}`,
      html: `<div style="font-family:'Helvetica Neue',Arial,sans-serif;max-width:600px;margin:0 auto;padding:40px 20px;background:#0a0c10;color:#e8eaf0">
        <p style="color:#4f8ef7;font-weight:700;font-size:14px;letter-spacing:0.04em;text-transform:uppercase;margin:0 0 20px">Revalor Social Media</p>
        <h1 style="color:#ffffff;font-size:22px;margin:0 0 12px">${params.brandName} — ${label}</h1>
        <p style="font-size:15px;line-height:1.6">${params.detail}</p>
        <p style="margin:30px 0">
          <a href="${APP_URL}/admin/social" style="background:#4f8ef7;color:#ffffff;padding:14px 28px;border-radius:100px;text-decoration:none;font-weight:700">Open Social Dashboard &rarr;</a>
        </p>
        <p style="color:#8b90a0;font-size:12px;margin-top:40px">Revalor LLC &middot; Software for the Human Condition</p>
      </div>`,
    }),
  }).catch((err) => console.error("[social/alerts] send failed:", err));
}
