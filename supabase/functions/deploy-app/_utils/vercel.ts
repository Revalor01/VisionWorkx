import type { ParsedFile } from "./parseCode.ts";

const VERCEL_BASE = "https://api.vercel.com";

// How long to poll for a READY deployment (ms). Stays under Edge Function limits.
const POLL_TIMEOUT_MS = 90_000;
const POLL_INTERVAL_MS = 8_000;

interface VercelDeployment {
  id: string;
  url: string;
  readyState: "QUEUED" | "BUILDING" | "READY" | "ERROR" | "CANCELED";
}

function buildUrl(path: string): string {
  const teamId = Deno.env.get("VERCEL_TEAM_ID");
  const q = teamId ? `?teamId=${encodeURIComponent(teamId)}` : "";
  return VERCEL_BASE + path + q;
}

function authHeaders(): Record<string, string> {
  const token = Deno.env.get("VERCEL_API_TOKEN");
  if (!token) throw new Error("VERCEL_API_TOKEN is not set");
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
}

async function vercelPost<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(buildUrl(path), {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "(empty)");
    throw new Error(`Vercel POST ${path} → ${res.status}: ${text.slice(0, 300)}`);
  }

  return res.json() as Promise<T>;
}

async function vercelGet<T>(path: string): Promise<T> {
  const res = await fetch(buildUrl(path), { headers: authHeaders() });

  if (!res.ok) {
    const text = await res.text().catch(() => "(empty)");
    throw new Error(`Vercel GET ${path} → ${res.status}: ${text.slice(0, 300)}`);
  }

  return res.json() as Promise<T>;
}

/**
 * Deploys a set of files to Vercel and returns the HTTPS deployment URL.
 *
 * The deployment is created immediately and the function polls until the
 * build reaches READY.  If POLL_TIMEOUT_MS elapses without READY, the
 * function returns the URL anyway — Vercel will finish the build shortly.
 */
export async function deployToVercel(
  projectName: string,
  files: ParsedFile[]
): Promise<string> {
  const deployment = await vercelPost<VercelDeployment>("/v13/deployments", {
    name: projectName,
    files: files.map((f) => ({ file: f.path, data: f.content })),
    projectSettings: {
      framework: "nextjs",
      installCommand: "npm install",
      buildCommand: "npm run build",
      outputDirectory: ".next",
    },
    target: "production",
  });

  const deployUrl = `https://${deployment.url}`;
  const deadline = Date.now() + POLL_TIMEOUT_MS;

  while (Date.now() < deadline) {
    await delay(POLL_INTERVAL_MS);

    const status = await vercelGet<VercelDeployment>(
      `/v13/deployments/${deployment.id}`
    );

    if (status.readyState === "READY") return deployUrl;

    if (status.readyState === "ERROR" || status.readyState === "CANCELED") {
      throw new Error(
        `Vercel deployment ${deployment.id} ended with state: ${status.readyState}`
      );
    }
  }

  // Return URL even if build is still in progress — it will become live soon.
  console.warn(
    `[vercel] Deployment ${deployment.id} still building after ${POLL_TIMEOUT_MS}ms — returning URL optimistically.`
  );
  return deployUrl;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
