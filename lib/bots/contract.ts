// Shared Bots contract (v1) — caller side for Machine 2 (VisionWorkx).
//
// VisionWorkx is a *caller* of the Revalor Bots intake endpoint, which is owned
// and hosted by Machine 1 (revalor-admin, https://revalor-admin.vercel.app).
// The task/approval tables (agent_tasks, approvals, agent_log, agent_budgets),
// the intake endpoint, and the consulting bot all live on Machine 1 — none of
// that is built here. This file mirrors only the parts of the shared contract
// VisionWorkx needs to *send* an intake task.
//
// This is a copy of a contract shared across three machines. Do NOT rename a
// field or change a task type here on your own: if the contract has to change,
// raise it with Machine 1 first and change every copy together (see the
// session rule "FOLLOW THE SHARED CONTRACT exactly ... stop and tell me").

/** Every task VisionWorkx sends is tagged with this source. */
export const BOTS_INTAKE_SOURCE = "visionworkx" as const;

/** The only task type VisionWorkx emits in Phase 1. */
export type IntakeTaskType = "intake.form_submitted";

export type IntakeFormAnswer = { question: string; answer: string };

/**
 * Payload for `type: "intake.form_submitted"` (source "visionworkx").
 *
 * company / contact_name / contact_email are optional: a form that doesn't
 * collect one simply omits it — we never invent a value (see 2B of the spec).
 */
export type IntakeFormSubmittedPayload = {
  form_id: string;
  company?: string;
  contact_name?: string;
  contact_email?: string;
  answers: IntakeFormAnswer[];
  submitted_at: string; // ISO 8601
  page_url: string;
  // true for a known test/QA submission (e.g. a sandbox email address). Machine
  // 1 parks these so they never reach the consulting bot as a real lead. Omit
  // (rather than send false) for a normal submission.
  is_test?: boolean;
};

/** The JSON envelope POSTed to the intake endpoint. */
export type IntakeRequestBody = {
  type: IntakeTaskType;
  source: typeof BOTS_INTAKE_SOURCE;
  payload: IntakeFormSubmittedPayload;
};

/** The 201 success body returned by the intake endpoint. */
export type IntakeAccepted = { task_id: string };
