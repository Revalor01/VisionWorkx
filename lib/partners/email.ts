// Reuses the raw-fetch Resend pattern already used across the repo
// (e.g. lib/promote/email.ts, app/api/admin/leads/email/route.ts).
// Sends from notify.revalorllc.com, a verified Resend sending domain
// kept separate from revalorllc.com's real mailboxes (support@,
// info@, admin@, etc. — hosted on SiteGround) to avoid any collision
// with that live mail setup.

const RESEND_KEY = process.env.RESEND_API_KEY;

async function sendEmail(params: { to: string; subject: string; html: string }): Promise<void> {
  if (!RESEND_KEY) return;
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "VisionWorkx Partnerships <partnerships@notify.revalorllc.com>",
        to: [params.to],
        reply_to: "admin@revalorllc.com",
        subject: params.subject,
        html: params.html,
      }),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      console.error(`[partners/email] Resend ${res.status}: ${text}`);
    }
  } catch (err) {
    console.error("[partners/email] send failed:", err);
  }
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
  signupUrl: string,
  loginUrl: string,
): Promise<void> {
  await sendEmail({
    to,
    subject: "You're approved as a VisionWorkx partner",
    html: wrapper(`
      <h1 style="color:#ffffff;font-size:24px;margin:0 0 12px">Welcome aboard, ${businessName}</h1>
      <p style="font-size:15px;line-height:1.6">Your application was approved as a <strong>${tierLabel}</strong>, which comes with a ${discountPercentage}% partner discount. Your partnership agreement is ready — create an account (or log in) to review and accept it.</p>
      <p style="margin:30px 0">
        <a href="${signupUrl}" style="background:#4f8ef7;color:#ffffff;padding:14px 28px;border-radius:100px;text-decoration:none;font-weight:700">Review Your Agreement &rarr;</a>
      </p>
      <p style="font-size:13px;color:#8b90a0">Already have an account? <a href="${loginUrl}" style="color:#4f8ef7">Log in</a> instead.</p>
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

export async function sendAgreementAcceptedEmail(businessName: string, tierLabel: string): Promise<void> {
  await sendEmail({
    to: "admin@revalorllc.com",
    subject: `${businessName} accepted their partnership agreement`,
    html: wrapper(`
      <h1 style="color:#ffffff;font-size:22px;margin:0 0 12px">Agreement accepted</h1>
      <p style="font-size:15px;line-height:1.6"><strong>${businessName}</strong> (${tierLabel}) just accepted their partnership agreement in the app.</p>
    `),
  });
}
