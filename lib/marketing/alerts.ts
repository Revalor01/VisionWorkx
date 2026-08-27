import { ADMIN_EMAIL } from "@/lib/adminSso";

// Mirrors lib/social/alerts.ts's raw-fetch Resend pattern — fire-and-forget
// by design, an email failure must never block the cron run that calls it.
const RESEND_KEY = process.env.RESEND_API_KEY;
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://vision-workx.vercel.app";

export async function sendReviewAlert(params: { productName: string; subject: string; campaignId: string }): Promise<void> {
  if (!RESEND_KEY) {
    console.error("[marketing/alerts] RESEND_API_KEY not configured, skipping alert:", params);
    return;
  }

  await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${RESEND_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: "Revalor Marketing <outreach@notify.revalorllc.com>",
      to: [ADMIN_EMAIL],
      subject: `[Marketing] ${params.productName} campaign ready for review — "${params.subject}"`,
      html: `<div style="font-family:'Helvetica Neue',Arial,sans-serif;max-width:600px;margin:0 auto;padding:40px 20px;background:#0a0c10;color:#e8eaf0">
        <p style="color:#4f8ef7;font-weight:700;font-size:14px;letter-spacing:0.04em;text-transform:uppercase;margin:0 0 20px">Revalor Marketing</p>
        <h1 style="color:#ffffff;font-size:22px;margin:0 0 12px">${params.productName} — campaign ready for review</h1>
        <p style="font-size:15px;line-height:1.6">A scheduled campaign generated a draft and is holding for review before it sends: <strong>${params.subject}</strong></p>
        <p style="margin:30px 0">
          <a href="${APP_URL}/admin/marketing" style="background:#4f8ef7;color:#ffffff;padding:14px 28px;border-radius:100px;text-decoration:none;font-weight:700">Open Marketing Dashboard &rarr;</a>
        </p>
        <p style="color:#8b90a0;font-size:12px;margin-top:40px">Revalor LLC &middot; Software for the Human Condition</p>
      </div>`,
    }),
  }).catch((err) => console.error("[marketing/alerts] send failed:", err));
}
