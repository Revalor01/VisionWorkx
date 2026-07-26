// Reuses the raw-fetch Resend pattern already used across the repo
// (e.g. lib/promote/email.ts, app/api/admin/leads/email/route.ts).
//
// NOTE: the sender below is still Resend's sandbox address
// (onboarding@resend.dev), which can only deliver to the Resend
// account's own verified email — not to real applicant inboxes. This
// is the same pre-existing, already-tracked gap noted in
// app/api/admin/leads/email/route.ts (switch to an @revalorllc.com
// sender once that domain is verified in Resend). These sends will
// succeed as API calls but won't land in a real applicant's inbox
// until that domain verification happens.

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
      from: "VisionWorkx Partnerships <onboarding@resend.dev>",
      to: [params.to],
      reply_to: "admin@revalorllc.com",
      subject: params.subject,
      html: params.html,
    }),
  }).catch((err) => console.error("[partners/email] send failed:", err));
}

function wrapper(bodyHtml: string): string {
  return `<div style="font-family:'Helvetica Neue',Arial,sans-serif;max-width:600px;margin:0 auto;padding:40px 20px;background:#0a0c10;color:#e8eaf0">
    <p style="color:#4f8ef7;font-weight:700;font-size:14px;letter-spacing:0.04em;text-transform:uppercase;margin:0 0 20px">VisionWorkx Partnership Program</p>
    ${bodyHtml}
    <p style="color:#8b90a0;font-size:12px;margin-top:40px">Revalor LLC &middot; Software for the Human Condition</p>
  </div>`;
}

export async function sendApplicationReceivedEmail(to: string, businessName: string): Promise<void> {
  await sendEmail({
    to,
    subject: "We've received your VisionWorkx partnership application",
    html: wrapper(`
      <h1 style="color:#ffffff;font-size:24px;margin:0 0 12px">Thanks, ${businessName}</h1>
      <p style="font-size:15px;line-height:1.6">Your partnership application is in. We review every application by hand and will follow up with a decision soon.</p>
    `),
  });
}

export async function sendApplicationApprovedEmail(
  to: string,
  businessName: string,
  tierLabel: string,
  discountPercentage: number,
): Promise<void> {
  await sendEmail({
    to,
    subject: "You're approved as a VisionWorkx partner",
    html: wrapper(`
      <h1 style="color:#ffffff;font-size:24px;margin:0 0 12px">Welcome aboard, ${businessName}</h1>
      <p style="font-size:15px;line-height:1.6">Your application was approved as a <strong>${tierLabel}</strong>, which comes with a ${discountPercentage}% partner discount. We'll be in touch shortly with next steps.</p>
    `),
  });
}

export async function sendApplicationDeniedEmail(to: string, businessName: string): Promise<void> {
  await sendEmail({
    to,
    subject: "Update on your VisionWorkx partnership application",
    html: wrapper(`
      <h1 style="color:#ffffff;font-size:22px;margin:0 0 12px">Thanks for applying, ${businessName}</h1>
      <p style="font-size:15px;line-height:1.6">After review, we're not able to move forward with a partnership at this time. We'd welcome a future application if your business changes.</p>
    `),
  });
}
