// Same raw-fetch Resend pattern as lib/social/alerts.ts, scoped to blog
// autonomy flags. The dashboard link always points at revalor-admin's /seo,
// not vision-workx's own stale /admin/seo — that's where the pipeline was
// ported to and where a human actually reviews/resumes autonomy now.

const RESEND_KEY = process.env.RESEND_API_KEY;
const ALERT_TO = "sawilliams721@gmail.com";
const SEO_DASHBOARD_URL = "https://revalor-admin.vercel.app/seo";

// Fire-and-forget by design — an email failure must never block the
// flag/pause logic that calls this.
export async function sendBlogAutonomyAlert(params: { productName: string; detail: string }): Promise<void> {
  if (!RESEND_KEY) {
    console.error("[blog/alerts] RESEND_API_KEY not configured, skipping alert:", params);
    return;
  }

  await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RESEND_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: "Revalor SEO <seo@notify.revalorllc.com>",
      to: [ALERT_TO],
      subject: `[Blog Autonomy] ${params.productName} needs your input — banned word caught`,
      html: `<div style="font-family:'Helvetica Neue',Arial,sans-serif;max-width:600px;margin:0 auto;padding:40px 20px;background:#0a0c10;color:#e8eaf0">
        <p style="color:#4f8ef7;font-weight:700;font-size:14px;letter-spacing:0.04em;text-transform:uppercase;margin:0 0 20px">Revalor SEO</p>
        <h1 style="color:#ffffff;font-size:22px;margin:0 0 12px">${params.productName} — banned word caught</h1>
        <p style="font-size:15px;line-height:1.6">${params.detail}</p>
        <p style="font-size:14px;line-height:1.6;color:#8b90a0">Auto-publishing for this product is paused until you review and resume it.</p>
        <p style="margin:30px 0">
          <a href="${SEO_DASHBOARD_URL}" style="background:#4f8ef7;color:#ffffff;padding:14px 28px;border-radius:100px;text-decoration:none;font-weight:700">Open SEO Dashboard &rarr;</a>
        </p>
        <p style="color:#8b90a0;font-size:12px;margin-top:40px">Revalor LLC &middot; Software for the Human Condition</p>
      </div>`,
    }),
  }).catch((err) => console.error("[blog/alerts] send failed:", err));
}
