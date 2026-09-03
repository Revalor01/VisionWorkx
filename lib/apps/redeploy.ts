// Phase 0 of "Closing the Builder Loop": the one place that ships a set of
// files for an already-existing app and records the build in app_revisions.
//
// The heavy deploy pipeline still lives in app/api/deploy/route.ts
// (schema creation, PostgREST exposure, the missing-file repair loop, env
// vars, Vercel project create-or-get, the readiness poll). Rather than move
// all of that here now, `deployFileMap` writes the new code and triggers
// that same internal /api/deploy endpoint — exactly how app/api/generate
// already kicks off the first deploy. What this module adds is the revision
// record: every build (the initial generation and every later edit) gets a
// row carrying the file map as it stood *before* the build, so any revision
// can be undone by redeploying its snapshot.
//
// NOTE: /api/deploy currently 409s if apps.status is already "deployed".
// `deployFileMap` resets status to "ready" before triggering, which clears
// that guard for a redeploy. Lifting the guard properly (and moving the
// pipeline into this file) is Phase 1 work, tracked there.

import { createServiceClient } from "@/lib/supabase";
import type { AppRevisionKind } from "@/lib/database.types";
import {
  diffFileMaps,
  parseFileMap,
  serializeFileMap,
  type FileMap,
} from "@/lib/apps/fileMap";

function appOrigin(): string {
  return process.env.NEXT_PUBLIC_APP_URL || "https://vision-workx.vercel.app";
}

/**
 * Fire the internal deploy pipeline for `appId`. Fire-and-forget: the route
 * runs for minutes and updates apps.status / app_revisions itself. Mirrors
 * the trigger in app/api/generate/route.ts.
 */
export function triggerDeploy(appId: string): void {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  void fetch(`${appOrigin()}/api/deploy`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${serviceKey}`,
    },
    body: JSON.stringify({ appId, _internal: true }),
  }).catch((err: unknown) =>
    console.error("[apps/redeploy] deploy trigger failed:", err),
  );
}

/**
 * Record the initial generation as the first row in an app's history.
 * Called by app/api/generate once `generated_code` is saved, before the
 * first deploy is triggered. Snapshot is the empty map — there was nothing
 * before it. Best-effort: a failure here must not fail generation.
 */
export async function recordInitialRevision(appId: string): Promise<void> {
  try {
    const service = createServiceClient();
    const { data: app } = await service
      .from("apps")
      .select("user_id")
      .eq("id", appId)
      .single();
    if (!app) return;

    await service.from("app_revisions").insert({
      app_id: appId,
      user_id: app.user_id,
      kind: "create",
      status: "building",
      file_snapshot: {},
      changed_files: [],
    });
  } catch (err) {
    console.error("[apps/redeploy] recordInitialRevision failed:", err);
  }
}

export interface DeployFileMapOptions {
  /** "change" (default) or "rollback". "create" is recordInitialRevision's job. */
  kind?: Exclude<AppRevisionKind, "create">;
  /** The customer's plain-English request, stored on the revision. */
  requestText?: string;
  /** One-line summary of what changed, from the edit engine. */
  changelog?: string;
}

/**
 * Ship `files` as the new code for an existing app and record the build.
 *
 * 1. read the current generated_code — that becomes the revision's rollback
 *    snapshot
 * 2. insert a "building" app_revisions row (snapshot + changed-paths diff)
 * 3. overwrite generated_code, reset status to "ready", clear deploy_url
 * 4. trigger the internal deploy pipeline, which calls {@link finalizeRevision}
 *    on the way out
 *
 * Returns the new revision's id.
 */
export async function deployFileMap(
  appId: string,
  files: FileMap,
  options: DeployFileMapOptions = {},
): Promise<string> {
  const service = createServiceClient();

  const { data: app, error } = await service
    .from("apps")
    .select("user_id, generated_code")
    .eq("id", appId)
    .single();
  if (error || !app) {
    throw new Error(`deployFileMap: app ${appId} not found`);
  }

  const previous: FileMap = app.generated_code
    ? parseFileMap(app.generated_code)
    : {};
  const { changed } = diffFileMaps(previous, files);

  const { data: revision, error: revErr } = await service
    .from("app_revisions")
    .insert({
      app_id: appId,
      user_id: app.user_id,
      kind: options.kind ?? "change",
      status: "building",
      request_text: options.requestText ?? null,
      changelog: options.changelog ?? null,
      file_snapshot: previous,
      changed_files: changed,
    })
    .select("id")
    .single();
  if (revErr || !revision) {
    throw new Error(`deployFileMap: could not record revision: ${revErr?.message}`);
  }

  await service
    .from("apps")
    .update({
      generated_code: serializeFileMap(files),
      status: "ready",
      deploy_url: null,
    })
    .eq("id", appId);

  triggerDeploy(appId);
  return revision.id;
}

/**
 * A queued change-request revision has been turned into a concrete edit by
 * lib/apps/editApp — record what it touched and ship the new code. The row
 * already exists (POST /api/apps/[appId]/revisions created it as "queued"),
 * so this updates it in place rather than inserting. finalizeRevision (from
 * the deploy pipeline) later flips it to "deployed" / "failed".
 */
export async function shipRevisionEdit(params: {
  revisionId: string;
  appId: string;
  previous: FileMap;
  next: FileMap;
  changelog: string;
}): Promise<void> {
  const service = createServiceClient();
  const { changed } = diffFileMaps(params.previous, params.next);

  await service
    .from("app_revisions")
    .update({
      status: "building",
      changelog: params.changelog.slice(0, 500),
      file_snapshot: params.previous,
      changed_files: changed,
    })
    .eq("id", params.revisionId);

  await service
    .from("apps")
    .update({
      generated_code: serializeFileMap(params.next),
      status: "ready",
      deploy_url: null,
    })
    .eq("id", params.appId);

  triggerDeploy(params.appId);
}

/** Mark a revision failed with a reason (the edit engine declined, etc.). */
export async function failRevision(revisionId: string, error: string): Promise<void> {
  try {
    await createServiceClient()
      .from("app_revisions")
      .update({ status: "failed", error: error.slice(0, 2000) })
      .eq("id", revisionId);
  } catch (err) {
    console.error("[apps/redeploy] failRevision failed:", err);
  }
}

/**
 * Close out the most recent in-flight revision for an app. Called by
 * app/api/deploy at the end of a run: `"deployed"` on success (with the
 * live URL), `"failed"` on any thrown error. A no-op when the app has no
 * open revision — apps generated before this table existed still deploy
 * fine. Best-effort; never throws.
 */
export async function finalizeRevision(
  appId: string,
  outcome: "deployed" | "failed",
  extra: { deployUrl?: string; previewUrl?: string; error?: string } = {},
): Promise<void> {
  try {
    const service = createServiceClient();
    const { data: open } = await service
      .from("app_revisions")
      .select("id")
      .eq("app_id", appId)
      .in("status", ["queued", "building"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!open) return;

    await service
      .from("app_revisions")
      .update({
        status: outcome,
        deployed_at: outcome === "deployed" ? new Date().toISOString() : null,
        preview_url: extra.previewUrl ?? null,
        error: outcome === "failed" ? (extra.error ?? "unknown error").slice(0, 2000) : null,
      })
      .eq("id", open.id);
  } catch (err) {
    console.error("[apps/redeploy] finalizeRevision failed:", err);
  }
}
