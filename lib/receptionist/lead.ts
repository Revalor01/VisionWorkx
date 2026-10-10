import { after } from "next/server";
import { modulesServiceClient } from "@/lib/modules/supabase";
import { sendWebhook } from "@/lib/modules/webhook";

// Saves a receptionist lead (or booking) as an ordinary submission, so it shows
// on the owner's board, in exports and in the bookings list, and fires the same
// side effects as a form submit: the `submission.created` event (revalor-
// automation sends the owner alert + customer confirmation) and the
// workspace's outgoing webhook. Deliberately separate from the public submit
// route so the live forms path isn't touched. Server-only.

export interface LeadInput {
  workspaceId: string;
  workspaceName: string;
  /** The module the submission belongs to (the receptionist, or the linked booking module for bookings). */
  moduleId: string;
  modulePublicId: string;
  moduleType: string;
  moduleName: string;
  values: Record<string, string>;
  fields: { id: string; label: string; type: string }[];
  sourceUrl: string | null;
}

export async function createLead(input: LeadInput): Promise<{ ok: true; submissionId: string } | { ok: false }> {
  const db = modulesServiceClient();
  const { data: sub, error } = await db
    .from("vw_submissions")
    .insert({ workspace_id: input.workspaceId, module_id: input.moduleId, data: input.values, source_url: input.sourceUrl })
    .select("id, created_at")
    .single();
  if (error || !sub) {
    console.error("[receptionist/lead] insert failed:", error?.code);
    return { ok: false };
  }

  const payload = {
    submission_id: sub.id,
    module: { id: input.modulePublicId, type: input.moduleType, name: input.moduleName },
    workspace: { id: input.workspaceId, name: input.workspaceName },
    data: input.values,
    fields: input.fields,
    created_at: sub.created_at,
  };
  const ev = await db.from("vw_events").insert({
    workspace_id: input.workspaceId,
    module_id: input.moduleId,
    submission_id: sub.id,
    type: "submission.created",
    payload,
  });
  if (ev.error) console.error("[receptionist/lead] event insert failed:", ev.error.code);

  after(async () => {
    const { data: ws } = await db.from("vw_workspaces").select("webhook_url, webhook_secret").eq("id", input.workspaceId).single();
    if (!ws?.webhook_url) return;
    const r = await sendWebhook(ws.webhook_url, ws.webhook_secret, { type: "submission.created", ...payload });
    await db.from("vw_webhook_deliveries").insert({ workspace_id: input.workspaceId, submission_id: sub.id, status_code: r.status, error: r.error });
  });

  return { ok: true, submissionId: sub.id };
}
