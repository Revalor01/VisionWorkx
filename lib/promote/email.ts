// Reuses the raw-fetch Resend pattern already used in app/api/deploy/route.ts
// (the `resend` SDK package is a dependency but unused elsewhere in this repo —
// staying consistent with the existing pattern rather than introducing a second way to send mail).

const RESEND_KEY = process.env.RESEND_API_KEY;

async function sendEmail(params: { to: string; subject: string; html: string }): Promise<void> {
  if (!RESEND_KEY) return;
  await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RESEND_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: "VisionWorkx Promote <onboarding@resend.dev>",
      to: [params.to],
      subject: params.subject,
      html: params.html,
    }),
  }).catch((err) => console.error("[promote/email] send failed:", err));
}

function wrapper(bodyHtml: string): string {
  return `<div style="font-family:'Helvetica Neue',Arial,sans-serif;max-width:600px;margin:0 auto;padding:40px 20px;background:#0a0c10;color:#e8eaf0">
    <p style="color:#4f8ef7;font-weight:700;font-size:14px;letter-spacing:0.04em;text-transform:uppercase;margin:0 0 20px">VisionWorkx Promote</p>
    ${bodyHtml}
    <p style="color:#8b90a0;font-size:12px;margin-top:40px">Revalor LLC &middot; Software for the Human Condition</p>
  </div>`;
}

export async function sendWelcomeEmail(to: string, businessName: string): Promise<void> {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://vision-workx.vercel.app";
  await sendEmail({
    to,
    subject: "Welcome to VisionWorkx Promote — let's build your first ad",
    html: wrapper(`
      <h1 style="color:#ffffff;font-size:24px;margin:0 0 12px">Welcome, ${businessName}</h1>
      <p style="font-size:15px;line-height:1.6">Three steps to your first ad:</p>
      <ol style="font-size:15px;line-height:1.8">
        <li>Generate AI-written ad copy and creative images</li>
        <li>Build a campaign — pick your audience and budget</li>
        <li>Submit it — we'll notify you the moment it's ready to go live</li>
      </ol>
      <p style="margin:30px 0">
        <a href="${appUrl}/promote/dashboard" style="background:#4f8ef7;color:#ffffff;padding:14px 28px;border-radius:100px;text-decoration:none;font-weight:700">Go to Dashboard &rarr;</a>
      </p>
    `),
  });
}

export async function sendCampaignPendingEmail(to: string, campaignName: string): Promise<void> {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://vision-workx.vercel.app";
  await sendEmail({
    to,
    subject: `"${campaignName}" is saved and pending platform approval`,
    html: wrapper(`
      <h1 style="color:#ffffff;font-size:22px;margin:0 0 12px">Campaign submitted</h1>
      <p style="font-size:15px;line-height:1.6"><strong>${campaignName}</strong> is saved. Live publishing to Meta and Google Ads is pending our advertising API approval — we'll email you the moment it's able to go live.</p>
      <p style="margin:30px 0">
        <a href="${appUrl}/promote/dashboard/campaigns" style="background:#4f8ef7;color:#ffffff;padding:14px 28px;border-radius:100px;text-decoration:none;font-weight:700">View Campaign &rarr;</a>
      </p>
    `),
  });
}
