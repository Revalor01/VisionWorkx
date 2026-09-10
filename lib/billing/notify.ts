// Transactional billing emails (trial ending, payment failed). Fail-soft:
// no RESEND_API_KEY -> logged no-op. Links to /billing, which has the
// "manage billing" button that opens the Stripe portal.

const RESEND_KEY = process.env.RESEND_API_KEY;
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://vision-workx.vercel.app";

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export async function sendBillingEmail(opts: {
  to: string;
  subject: string;
  heading: string;
  /** Plain paragraphs — each becomes a <p>. */
  body: string[];
  ctaLabel?: string;
}): Promise<boolean> {
  if (!RESEND_KEY) {
    console.warn(`[billing/notify] RESEND_API_KEY missing — skipped "${opts.subject}" to ${opts.to}`);
    return false;
  }
  const paras = opts.body.map((p) => `<p style="margin:0 0 14px">${esc(p)}</p>`).join("");
  const cta = `<p style="margin:28px 0"><a href="${APP_URL}/billing" style="background:#1A3A5C;color:#fff;padding:14px 28px;border-radius:8px;text-decoration:none;font-weight:bold">${esc(opts.ctaLabel ?? "Manage billing")}</a></p>`;
  const html = `<div style="font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;max-width:600px;margin:0 auto;padding:40px 20px">
    <h1 style="color:#1A3A5C;font-size:20px">${esc(opts.heading)}</h1>
    ${paras}
    ${cta}
    <p style="color:#999;font-size:12px">Vision Workx · A Revalor Company</p>
  </div>`;

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${RESEND_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: "Vision Workx <notifications@notify.revalorllc.com>",
        to: [opts.to],
        subject: opts.subject,
        html,
      }),
    });
    if (!res.ok) {
      console.error(`[billing/notify] Resend ${res.status}: ${(await res.text().catch(() => "")).slice(0, 200)}`);
      return false;
    }
    return true;
  } catch (err) {
    console.error("[billing/notify] send threw:", err);
    return false;
  }
}

/** id -> email for a set of auth users, via the Management API. */
export async function lookupUserEmails(userIds: string[]): Promise<Record<string, string>> {
  const token = process.env.SUPABASE_MANAGEMENT_TOKEN;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!token || !url || userIds.length === 0) return {};
  const ref = new URL(url).hostname.split(".")[0];
  const inList = userIds.map((id) => `'${id.replace(/'/g, "")}'`).join(",");
  try {
    const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ query: `SELECT id, email FROM auth.users WHERE id IN (${inList})` }),
    });
    if (!res.ok) return {};
    const rows: { id: string; email: string }[] = await res.json();
    return Object.fromEntries(rows.map((r) => [r.id, r.email]));
  } catch {
    return {};
  }
}
