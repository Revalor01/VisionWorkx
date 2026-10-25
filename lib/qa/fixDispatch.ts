// Dispatches the qa-fix workflow (in the revalor-agents repo) that runs an AI
// coding agent against a product's repo for one failing test and opens a DRAFT
// PR for review. Separate token from QA_GITHUB_TOKEN: QA_FIX_TOKEN needs
// "Actions: write" on revalor-agents (the workflow there carries its own token
// with write access to the product repos). Never auto-merges anything.

const WORKFLOW = "qa-fix.yml";

export function qaFixConfigured(): boolean {
  return !!process.env.QA_FIX_TOKEN;
}

export interface QaFixInputs {
  product: string;
  repo: string; // "Owner/name" of the app under test
  testId: string;
  testTitle: string;
  errorMessage: string;
  errorStep: string;
  runUrl: string;
}

export async function dispatchQaFix(inputs: QaFixInputs): Promise<{ ok: true } | { ok: false; error: string }> {
  const agentsRepo = process.env.QA_FIX_REPO ?? "Revalor01/revalor-agents";
  let res: Response;
  try {
    res = await fetch(`https://api.github.com/repos/${agentsRepo}/actions/workflows/${WORKFLOW}/dispatches`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.QA_FIX_TOKEN}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        ref: process.env.QA_FIX_REF ?? "main",
        // workflow_dispatch inputs are strings and size-limited — truncate.
        inputs: {
          product: inputs.product,
          repo: inputs.repo,
          test_id: inputs.testId,
          test_title: inputs.testTitle.slice(0, 200),
          error_message: inputs.errorMessage.slice(0, 4000),
          error_step: inputs.errorStep.slice(0, 300),
          run_url: inputs.runUrl.slice(0, 300),
        },
      }),
      signal: AbortSignal.timeout(10_000),
    });
  } catch (err) {
    console.error("[qa] fix dispatch failed:", err);
    return { ok: false, error: "Couldn't reach GitHub." };
  }
  if (res.ok) return { ok: true };
  const body = await res.text().catch(() => "");
  console.error("[qa] fix dispatch failed:", res.status, body.slice(0, 300));
  if (res.status === 404) return { ok: false, error: "GitHub couldn't find the qa-fix workflow (is it on revalor-agents' main?)" };
  if (res.status === 401 || res.status === 403) return { ok: false, error: "GitHub rejected QA_FIX_TOKEN (expired, or missing Actions write on revalor-agents)." };
  return { ok: false, error: `GitHub returned ${res.status}.` };
}
