import { NextRequest, NextResponse } from "next/server";
import { createServerClient, createServiceClient } from "@/lib/supabase";
import { deployFileMap } from "@/lib/apps/redeploy";
import type { FileMap } from "@/lib/apps/fileMap";

export const runtime = "nodejs";

// POST — redeploy the source as it stood before `revisionId`. Recorded as a
// new "rollback" revision (its own snapshot is the current, pre-rollback
// code), so a rollback is itself reversible. Does not count against the
// monthly change quota.
export async function POST(
  _req: NextRequest,
  props: { params: Promise<{ appId: string; revisionId: string }> },
) {
  const { appId, revisionId } = await props.params;

  const supabase = await createServerClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const service = createServiceClient();

  const { data: app } = await service
    .from("apps")
    .select("id, user_id, deploy_url")
    .eq("id", appId)
    .single();
  if (!app || app.user_id !== user.id) {
    return NextResponse.json({ error: "App not found" }, { status: 404 });
  }
  if (!app.deploy_url) {
    return NextResponse.json({ error: "This app isn't live yet." }, { status: 409 });
  }

  const { data: openRow } = await service
    .from("app_revisions")
    .select("id")
    .eq("app_id", appId)
    .in("status", ["queued", "building"])
    .limit(1)
    .maybeSingle();
  if (openRow) {
    return NextResponse.json(
      { error: "A change is already in progress for this app." },
      { status: 409 },
    );
  }

  const { data: revision } = await service
    .from("app_revisions")
    .select("id, app_id, kind, status, request_text, changelog, file_snapshot")
    .eq("id", revisionId)
    .single();
  if (!revision || revision.app_id !== appId) {
    return NextResponse.json({ error: "Revision not found" }, { status: 404 });
  }
  if (revision.status !== "deployed") {
    return NextResponse.json(
      { error: "You can only roll back to a revision that finished deploying." },
      { status: 409 },
    );
  }

  const snapshot = (revision.file_snapshot ?? {}) as FileMap;
  if (Object.keys(snapshot).length === 0) {
    return NextResponse.json(
      { error: "There's no earlier version to roll back to." },
      { status: 409 },
    );
  }

  const label = revision.changelog || revision.request_text || revision.id;
  await deployFileMap(appId, snapshot, {
    kind: "rollback",
    changelog: `Rolled back to the version before: ${label}`.slice(0, 500),
  });

  return NextResponse.json({ ok: true });
}
