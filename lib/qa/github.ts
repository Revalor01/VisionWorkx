// Starts the QA workflow (.github/workflows/qa-run.yml) in GitHub Actions.
// QA_GITHUB_TOKEN: fine-grained token, this repo only, "Actions: read and write".

const WORKFLOW = "qa-run.yml";

export function qaDispatchConfigured(): boolean {
  return !!process.env.QA_GITHUB_TOKEN;
}

export async function dispatchQaRun(inputs: {
  runId: string;
  product: string;
  targetUrl: string;
  targetEnv: string;
  grep: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const repo = process.env.QA_GITHUB_REPO ?? "Revalor01/VisionWorkx";
  let res: Response;
  try {
    res = await fetch(`https://api.github.com/repos/${repo}/actions/workflows/${WORKFLOW}/dispatches`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.QA_GITHUB_TOKEN}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        ref: process.env.QA_GITHUB_REF ?? "main",
        inputs: {
          run_id: inputs.runId,
          product: inputs.product,
          target_url: inputs.targetUrl,
          target_env: inputs.targetEnv,
          grep: inputs.grep,
        },
      }),
      signal: AbortSignal.timeout(10_000),
    });
  } catch (err) {
    console.error("[qa] workflow dispatch failed:", err);
    return { ok: false, error: "Couldn't reach GitHub." };
  }
  if (res.ok) return { ok: true };
  const body = await res.text().catch(() => "");
  console.error("[qa] workflow dispatch failed:", res.status, body.slice(0, 300));
  if (res.status === 404) return { ok: false, error: "GitHub couldn't find the QA workflow (is qa-run.yml on main?)" };
  if (res.status === 401 || res.status === 403) return { ok: false, error: "GitHub rejected QA_GITHUB_TOKEN (expired, or missing Actions write access)." };
  return { ok: false, error: `GitHub returned ${res.status}.` };
}
