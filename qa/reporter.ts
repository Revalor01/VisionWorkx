import { readFile } from "fs/promises";
import type { FullResult, Reporter, TestCase, TestError, TestResult, TestStep } from "@playwright/test/reporter";

// Sends results to /api/admin/qa/report as tests finish, then uploads each
// failure's screenshot/trace/video to the signed URLs it gets back.
// A no-op unless QA_REPORT_URL and QA_REPORT_SECRET are set (local runs).

type Kind = "screenshot" | "trace" | "video";
const CONTENT_TYPE: Record<Kind, string> = { screenshot: "image/png", trace: "application/zip", video: "video/webm" };

function mapStatus(status: string, retry: number): string {
  if (status === "passed") return retry > 0 ? "flaky" : "passed";
  if (status === "skipped") return "skipped";
  if (status === "timedOut") return "timed_out";
  return "failed";
}

function failingStep(steps: TestStep[]): string | null {
  for (const s of steps) {
    if (s.error) return failingStep(s.steps) ?? s.title;
  }
  return null;
}

export default class QaReporter implements Reporter {
  private url = process.env.QA_REPORT_URL?.replace(/\/$/, "");
  private secret = process.env.QA_REPORT_SECRET;
  private runId: Promise<string | null> = Promise.resolve(process.env.QA_RUN_ID || null);
  private pending: Promise<unknown>[] = [];
  private errors: string[] = [];

  private get enabled() {
    return !!(this.url && this.secret);
  }

  private async post(body: object): Promise<Record<string, unknown> | null> {
    try {
      const res = await fetch(`${this.url}/api/admin/qa/report`, {
        method: "POST",
        headers: { Authorization: `Bearer ${this.secret}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = (await res.json().catch(() => null)) as Record<string, unknown> | null;
      if (!res.ok) console.warn(`[qa-reporter] ${(body as { type: string }).type} → ${res.status} ${JSON.stringify(json)}`);
      return res.ok ? json : null;
    } catch (err) {
      console.warn("[qa-reporter] post failed:", err instanceof Error ? err.message : err);
      return null;
    }
  }

  onBegin() {
    if (!this.enabled) return;
    const gh = process.env.GITHUB_RUN_ID ? `${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}` : null;
    this.runId = this.runId.then(async (existing) => {
      const r = await this.post({
        type: "begin",
        runId: existing,
        product: process.env.QA_PRODUCT,
        targetUrl: process.env.QA_TARGET_URL,
        targetEnv: process.env.QA_TARGET_ENV,
        githubRunUrl: gh,
      });
      return (r?.runId as string | undefined) ?? existing;
    });
  }

  onTestEnd(test: TestCase, result: TestResult) {
    if (!this.enabled) return;
    const idTag = test.tags.find((t) => /^@[a-z0-9-]+\//.test(t));
    if (!idTag) return; // not declared with qa()
    // The phone-sized re-run of a test is tracked as its own entry.
    const testId = test.parent.project()?.name === "mobile" ? `${idTag.slice(1)}--mobile` : idTag.slice(1);
    const attachments = result.attachments.filter(
      (a): a is typeof a & { name: Kind; path: string } => !!a.path && (a.name === "screenshot" || a.name === "trace" || a.name === "video"),
    );
    this.pending.push(
      (async () => {
        const runId = await this.runId;
        if (!runId) return;
        const r = await this.post({
          type: "result",
          runId,
          testId,
          status: mapStatus(result.status, result.retry),
          attempt: result.retry + 1,
          durationMs: result.duration,
          errorMessage: result.error ? [result.error.message, result.error.snippet].filter(Boolean).join("\n\n") : null,
          errorStep: failingStep(result.steps),
          attachments: attachments.map((a) => a.name),
        });
        const uploads = (r?.uploads ?? {}) as Partial<Record<Kind, string>>;
        for (const a of attachments) {
          const signed = uploads[a.name];
          if (!signed) continue;
          try {
            const res = await fetch(signed, { method: "PUT", headers: { "Content-Type": CONTENT_TYPE[a.name], "x-upsert": "true" }, body: await readFile(a.path) });
            if (!res.ok) console.warn(`[qa-reporter] upload ${a.name} → ${res.status}`);
          } catch (err) {
            console.warn(`[qa-reporter] upload ${a.name} failed:`, err instanceof Error ? err.message : err);
          }
        }
      })(),
    );
  }

  onError(error: TestError) {
    this.errors.push(error.message ?? String(error.value ?? "Unknown error"));
  }

  async onEnd(result: FullResult) {
    if (!this.enabled) return;
    await Promise.allSettled(this.pending);
    const runId = await this.runId;
    if (!runId) return;
    await this.post({ type: "end", runId, status: result.status, error: this.errors.length ? this.errors.join("\n\n").slice(0, 2000) : null });
  }

  printsToStdio() {
    return false;
  }
}
