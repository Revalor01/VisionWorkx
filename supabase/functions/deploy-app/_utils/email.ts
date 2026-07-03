interface DeployEmailParams {
  to: string;
  userName: string;
  appName: string;
  deployUrl: string;
}

const RESEND_API = "https://api.resend.com/emails";
const APP_URL = Deno.env.get("NEXT_PUBLIC_APP_URL") ?? "https://app.visionworkx.com";

/**
 * Sends the "your app is live" notification via Resend.
 * Errors are logged but not re-thrown so a failed email never rolls back a
 * successful deployment.
 */
export async function sendDeployEmail(params: DeployEmailParams): Promise<void> {
  const apiKey = Deno.env.get("RESEND_API_KEY");
  if (!apiKey) {
    console.warn("[email] RESEND_API_KEY not set — skipping email");
    return;
  }

  const res = await fetch(RESEND_API, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: "Vision Workx <noreply@visionworkx.com>",
      to: [params.to],
      subject: `Your app "${params.appName}" is live!`,
      html: buildEmailHtml(params),
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    console.error("[email] Resend error:", res.status, text.slice(0, 200));
  }
}

function buildEmailHtml({ userName, appName, deployUrl }: DeployEmailParams): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Your app is live!</title>
</head>
<body style="margin:0;padding:0;background:#F8FAFC;font-family:Inter,-apple-system,BlinkMacSystemFont,sans-serif;">
  <div style="max-width:560px;margin:48px auto;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,.08);">

    <!-- Header -->
    <div style="background:#1A3A5C;padding:32px 40px;text-align:center;">
      <p style="margin:0;color:#ffffff;font-size:20px;font-weight:700;letter-spacing:-0.3px;">Vision Workx</p>
      <p style="margin:4px 0 0;color:#93C5FD;font-size:12px;">A Revalor Company</p>
    </div>

    <!-- Body -->
    <div style="padding:40px;">
      <p style="margin:0 0 4px;font-size:36px;line-height:1;">🚀</p>
      <h1 style="margin:12px 0 8px;font-size:26px;font-weight:700;color:#1A3A5C;">Your app is live!</h1>
      <p style="margin:0 0 28px;font-size:15px;color:#6B7280;line-height:1.7;">
        Hi ${escapeHtml(userName)},<br><br>
        Your app <strong style="color:#1A3A5C;">&ldquo;${escapeHtml(appName)}&rdquo;</strong> has been
        successfully deployed and is live right now. Share the link below with your customers and
        start growing.
      </p>

      <!-- URL card -->
      <div style="background:#F8FAFC;border:1px solid #E5E7EB;border-radius:12px;padding:20px 24px;margin-bottom:28px;">
        <p style="margin:0 0 6px;font-size:11px;font-weight:700;color:#9CA3AF;text-transform:uppercase;letter-spacing:.6px;">Your App URL</p>
        <p style="margin:0;font-size:16px;font-weight:600;color:#2E6DA4;word-break:break-all;">${escapeHtml(deployUrl)}</p>
      </div>

      <!-- CTA -->
      <div style="text-align:center;margin-bottom:36px;">
        <a href="${deployUrl}"
           style="display:inline-block;background:#1A3A5C;color:#ffffff;font-size:15px;font-weight:600;padding:14px 36px;border-radius:10px;text-decoration:none;">
          Open Your App →
        </a>
      </div>

      <hr style="border:none;border-top:1px solid #E5E7EB;margin:0 0 24px;">

      <p style="margin:0;font-size:13px;color:#6B7280;line-height:1.7;">
        Manage your app and subscription from your
        <a href="${APP_URL}/dashboard" style="color:#2E6DA4;text-decoration:none;font-weight:500;">dashboard</a>.
        Questions? Reply to this email and we&rsquo;ll help you out.
      </p>
    </div>

    <!-- Footer -->
    <div style="padding:20px 40px;background:#F8FAFC;border-top:1px solid #E5E7EB;text-align:center;">
      <p style="margin:0;font-size:12px;color:#9CA3AF;">
        Vision Workx &middot; A Revalor Company<br>
        <a href="${APP_URL}/billing" style="color:#9CA3AF;text-decoration:underline;">Manage subscription</a>
      </p>
    </div>
  </div>
</body>
</html>`;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
