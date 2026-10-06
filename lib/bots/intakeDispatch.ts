import {
  BOTS_INTAKE_SOURCE,
  type IntakeAccepted,
  type IntakeFormSubmittedPayload,
  type IntakeRequestBody,
} from "./contract";

// Sends an intake task to the Revalor Bots intake endpoint on Machine 1
// (revalor-admin). This is the whole of VisionWorkx's Phase 1 bot role: it is a
// caller, not an owner. The endpoint queues the task (status 'queued') and
// writes the agent_log row on receipt — VisionWorkx never touches Machine 1's
// tables itself, and logs its own dispatch only to the console here.
//
// Designed to be called from `after()` (post-response) so a slow or down intake
// endpoint can never delay or break the signup the visitor just completed:
//  - it reads config at call time and no-ops cleanly when unconfigured,
//  - it has its own timeout so the function can't hang, and
//  - it never throws; every failure comes back as a typed result and is logged.
//
// Env (set on Machine 2 / VisionWorkx; never commit the key):
//   BOTS_INTAKE_KEY_VISIONWORKX — the per-source secret for source "visionworkx"
//                      (sent as the `x-revalor-intake-key` header). Required.
//   BOTS_INTAKE_URL  — override the endpoint; defaults to production below.

const DEFAULT_INTAKE_URL = "https://revalor-admin.vercel.app/api/bots/intake";
const TIMEOUT_MS = 5000;

export type DispatchResult =
  | { ok: true; taskId: string }
  | {
      ok: false;
      reason: "not_configured" | "http_error" | "bad_response" | "network_error";
      status?: number;
      error?: string;
    };

// One POST attempt with its own 5s timeout. Returns a typed result and never
// throws or logs — the caller owns logging and the retry decision.
async function attemptOnce(url: string, key: string, body: IntakeRequestBody): Promise<DispatchResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-revalor-intake-key": key,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return { ok: false, reason: "http_error", status: res.status, error: text.slice(0, 200) };
    }

    const data = (await res.json().catch(() => null)) as IntakeAccepted | null;
    if (!data || typeof data.task_id !== "string") {
      return { ok: false, reason: "bad_response", status: res.status };
    }
    return { ok: true, taskId: data.task_id };
  } catch (err) {
    return { ok: false, reason: "network_error", error: err instanceof Error ? err.message : String(err) };
  } finally {
    clearTimeout(timer);
  }
}

export async function dispatchIntakeFormSubmitted(
  payload: IntakeFormSubmittedPayload,
): Promise<DispatchResult> {
  const key = process.env.BOTS_INTAKE_KEY_VISIONWORKX;
  if (!key) {
    // Not an error: the integration is simply off until the key is set.
    console.warn("[bots/intake] BOTS_INTAKE_KEY_VISIONWORKX not set — skipping dispatch.");
    return { ok: false, reason: "not_configured" };
  }
  const url = process.env.BOTS_INTAKE_URL || DEFAULT_INTAKE_URL;

  const body: IntakeRequestBody = {
    type: "intake.form_submitted",
    source: BOTS_INTAKE_SOURCE,
    payload,
  };

  // Try once, retry once on any failure. This runs post-response (via after()),
  // so the extra attempt's latency never reaches the visitor whose submission
  // already succeeded.
  let result = await attemptOnce(url, key, body);
  if (!result.ok) {
    const status = "status" in result && result.status ? ` ${result.status}` : "";
    console.warn(`[bots/intake] ${payload.form_id} dispatch failed (${result.reason}${status}) — retrying once`);
    result = await attemptOnce(url, key, body);
  }

  if (result.ok) {
    console.log(`[bots/intake] dispatched ${body.type} (${payload.form_id}) -> task ${result.taskId}`);
  } else {
    console.error(`[bots/intake] ${payload.form_id} dispatch failed after retry: ${result.reason}`);
  }
  return result;
}
