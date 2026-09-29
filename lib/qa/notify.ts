import { ADMIN_EMAIL } from "@/lib/adminSso";

// Emails the operator about NIGHTLY QA runs only (manual runs are watched live):
// when a nightly run fails, and once when a product goes back to green.

export interface NotifyRun {
  id: string;
  product_slug: string;
  status: string;
  passed: number;
  failed: number;
  error: string | null;
}

export interface FailedTest {
  title: string;
  error_step: string | null;
}

export function nightlyEmail(
  run: NotifyRun,
  failures: FailedTest[],
  previousStatus: string | null,
  runUrl: string,
): { subject: string; text: string } | null {
  const bad = run.status === "failed" || run.status === "error";
  if (!bad) {
    // Only worth an email when it's news: the previous nightly was red.
    if (run.status === "passed" && (previousStatus === "failed" || previousStatus === "error")) {
      return {
        subject: `✅ ${run.product_slug} tests are green again`,
        text: `Last night's QA run for ${run.product_slug} passed (${run.passed} tests) after the previous nightly run failed.\n\n${runUrl}\n`,
      };
    }
    return null;
  }
  const lines = failures.slice(0, 15).map((f) => `• ${f.title}${f.error_step ? ` — failed at: ${f.error_step}` : ""}`);
  if (failures.length > 15) lines.push(`…and ${failures.length - 15} more`);
  const summary =
    run.status === "error" && failures.length === 0
      ? `The run couldn't complete${run.error ? `:\n${run.error.slice(0, 500)}` : "."}`
      : `${run.failed} failed, ${run.passed} passed:\n\n${lines.join("\n")}`;
  return {
    subject: `❌ ${run.product_slug} nightly tests: ${run.failed || "run"} failed`,
    text: `Last night's QA run for ${run.product_slug} didn't pass.\n\n${summary}\n\nScreenshots, videos and traces:\n${runUrl}\n`,
  };
}

export async function sendQaEmail(email: { subject: string; text: string }): Promise<void> {
  const key = process.env.RESEND_API_KEY;
  if (!key) return;
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: "Revalor QA <notifications@notify.revalorllc.com>", to: [ADMIN_EMAIL], subject: email.subject, text: email.text }),
  }).catch(() => null);
  if (res && !res.ok) console.error("[qa] notification email failed:", res.status);
}
