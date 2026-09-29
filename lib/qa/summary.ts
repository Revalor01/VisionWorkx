import type { ResultStatus, RunStatus } from "./db";

// Pure helpers shared by the report route and the admin pages (unit-tested).

export const TEST_ID_RE = /^[a-z0-9-]+(\/[a-z0-9-]+){2,}$/;
export const PRODUCT_RE = /^[a-z0-9-]{2,40}$/;

/** A run with no sign of life after this long probably never started in GitHub Actions. */
export const STALE_QUEUED_MS = 15 * 60_000;

export interface ResultLike {
  test_id: string;
  status: ResultStatus;
  attempt: number;
}

/** Latest attempt per test. */
export function finalResults<T extends ResultLike>(results: T[]): T[] {
  const byTest = new Map<string, T>();
  for (const r of results) {
    const prev = byTest.get(r.test_id);
    if (!prev || r.attempt > prev.attempt) byTest.set(r.test_id, r);
  }
  return [...byTest.values()];
}

export function countResults(results: ResultLike[]) {
  let passed = 0;
  let failed = 0;
  let skipped = 0;
  for (const r of finalResults(results)) {
    if (r.status === "passed" || r.status === "flaky") passed++;
    else if (r.status === "skipped") skipped++;
    else failed++;
  }
  return { passed, failed, skipped };
}

/** Final run status from its results plus whatever the runner reported. */
export function finalRunStatus(counts: { passed: number; failed: number }, runnerStatus: string | undefined): RunStatus {
  if (counts.failed > 0) return "failed";
  if (runnerStatus === "interrupted" || runnerStatus === "timedout") return "error";
  if (runnerStatus === "failed") return counts.passed > 0 ? "failed" : "error"; // failed with no failed tests = setup/global error
  return counts.passed > 0 ? "passed" : "error";
}

export function mapPlaywrightStatus(status: string, retry: number): ResultStatus {
  if (status === "passed") return retry > 0 ? "flaky" : "passed";
  if (status === "skipped") return "skipped";
  if (status === "timedOut") return "timed_out";
  return "failed";
}

/** Storage path for one attachment of one attempt. */
export function artifactPath(runId: string, testId: string, attempt: number, kind: "screenshot" | "trace" | "video"): string {
  const ext = kind === "screenshot" ? "png" : kind === "trace" ? "zip" : "webm";
  return `${runId}/${testId.replace(/\//g, "__")}/attempt-${attempt}-${kind}.${ext}`;
}

/** Playwright --grep for a set of test ids (each test carries an @<id> tag). */
export function grepFor(selection: "smoke" | "all" | "custom", testIds: string[]): string {
  if (selection === "smoke") return "@smoke";
  if (selection === "all") return "";
  // Ids are [a-z0-9-/] only (TEST_ID_RE), so no regex escaping is needed; the
  // lookahead stops "@a/b/c" from also matching "@a/b/c-more" or "@a/b/c/d".
  // A "--mobile" entry is the phone re-run of the same test: select the base test.
  const ids = [...new Set(testIds.map((id) => id.replace(/--mobile$/, "")))];
  return ids.map((id) => `@${id}(?![\\w/-])`).join("|");
}

export function isStale(run: { status: RunStatus; created_at: string }, now = Date.now()): boolean {
  return run.status === "queued" && now - new Date(run.created_at).getTime() > STALE_QUEUED_MS;
}

export function stripAnsi(s: string): string {
  return s.replace(/\u001b\[[0-9;]*m/g, "");
}
