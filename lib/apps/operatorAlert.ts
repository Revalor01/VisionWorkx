// Emails the operator when a customer's app build fails. Nothing else
// tells them — status just flips to "failed" and it shows up in /admin
// and /admin/ops if they go looking. Fail-soft: no RESEND_API_KEY -> a
// logged no-op.

const RESEND_KEY = process.env.RESEND_API_KEY;
const OPERATOR_EMAIL = process.env.OPERATOR_EMAIL || "info@revalorllc.com";
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://vision-workx.vercel.app";

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export async function notifyBuildFailure(opts: {
  stage: "generate" | "deploy" | "change";
  appId: string;
  appName?: string | null;
  customer?: string | null;
  error: string;
  buildLog?: string | null;
  requestText?: string | null;
}): Promise<void> {
  if (!RESEND_KEY) {
    console.warn(`[operatorAlert] RESEND_API_KEY missing — skipped ${opts.stage}-failure alert for ${opts.appId}`);
    return;
  }

  const rows: [string, string][] = [
    ["Stage", opts.stage],
    ["App", `${opts.appName || "(unnamed)"} — ${opts.appId}`],
    ["Customer", opts.customer || "unknown"],
    ...(opts.requestText ? ([["Change request", opts.requestText.slice(0, 400)]] as [string, string][]) : []),
    ["Error", opts.error.slice(0, 600)],
  ];
  const table = rows
    .map(
      ([k, v]) =>
        `<tr><td style="padding:4px 14px 4px 0;color:#666;vertical-align:top;white-space:nowrap">${k}</td><td style="padding:4px 0"><strong>${esc(v)}</strong></td></tr>`,
    )
    .join("");
  const logBlock = opts.buildLog
    ? `<p style="font-size:12px;color:#666;margin:16px 0 4px">Build log (truncated):</p><pre style="white-space:pre-wrap;font-size:12px;background:#f6f6f6;padding:12px;border-radius:8px;overflow:auto">${esc(opts.buildLog.slice(0, 3000))}</pre>`
    : "";

  const html = `<div style="font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;max-width:640px;margin:0 auto;padding:8px">
    <h2 style="color:#b91c1c;margin:0 0 12px">Build failed &mdash; ${opts.stage}</h2>
    <table style="font-size:14px;border-collapse:collapse">${table}</table>
    ${logBlock}
    <p style="margin-top:20px"><a href="${APP_URL}/admin/ops" style="color:#1A3A5C;font-weight:600">Open the Ops dashboard &rarr;</a></p>
    <p style="color:#999;font-size:12px;margin-top:16px">Vision Workx &middot; automated alert</p>
  </div>`;

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${RESEND_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: "Vision Workx <notifications@notify.revalorllc.com>",
        to: [OPERATOR_EMAIL],
        subject: `⚠️ ${opts.stage} failed: ${opts.appName || opts.appId}`,
        html,
      }),
    });
    if (!res.ok) {
      console.error(`[operatorAlert] Resend ${res.status}: ${(await res.text().catch(() => "")).slice(0, 200)}`);
    }
  } catch (err) {
    console.error("[operatorAlert] send threw:", err);
  }
}
