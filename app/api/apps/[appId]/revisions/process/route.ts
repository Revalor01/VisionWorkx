import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";
import { parseFileMap } from "@/lib/apps/fileMap";
import { editApp, EditNoOpError } from "@/lib/apps/editApp";
import { failRevision, shipRevisionEdit } from "@/lib/apps/redeploy";
import type { AppCategory } from "@/lib/database.types";

export const runtime = "nodejs";
// One Claude edit pass over the full app source can run a couple of minutes
// on a large app; the deploy it triggers is separate (fire-and-forget).
export const maxDuration = 300;

// Internal only — queued by POST /api/apps/[appId]/revisions with the
// service-role key. Runs the edit engine and hands the result to the
// deploy pipeline.
export async function POST(
  req: NextRequest,
  props: { params: Promise<{ appId: string }> },
) {
  const { appId } = await props.params;

  const auth = req.headers.get("authorization") ?? "";
  if (auth !== `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY ?? ""}`) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: { revisionId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const revisionId = body.revisionId ?? "";
  if (!revisionId) {
    return NextResponse.json({ error: "Missing revisionId" }, { status: 400 });
  }

  const service = createServiceClient();

  const { data: revision } = await service
    .from("app_revisions")
    .select("id, app_id, kind, status, request_text")
    .eq("id", revisionId)
    .single();
  if (!revision || revision.app_id !== appId) {
    return NextResponse.json({ error: "Revision not found" }, { status: 404 });
  }
  if (revision.status !== "queued" || revision.kind !== "change") {
    return NextResponse.json({ error: "Revision is not queued" }, { status: 409 });
  }

  const { data: app } = await service
    .from("apps")
    .select("id, name, category, generated_code")
    .eq("id", appId)
    .single();
  if (!app?.generated_code) {
    await failRevision(revisionId, "The app has no source to edit.");
    return NextResponse.json({ error: "No source" }, { status: 409 });
  }

  await service
    .from("app_revisions")
    .update({ status: "building" })
    .eq("id", revisionId);

  const current = parseFileMap(app.generated_code);

  let result;
  try {
    result = await editApp(current, revision.request_text ?? "", {
      appName: app.name,
      category: app.category as AppCategory,
    });
  } catch (err) {
    if (err instanceof EditNoOpError) {
      await failRevision(revisionId, `Could not apply: ${err.message}`);
      return NextResponse.json({ ok: false, reason: err.message });
    }
    console.error("[revisions/process] editApp failed:", err);
    await failRevision(revisionId, `Edit failed: ${(err as Error).message}`);
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }

  await shipRevisionEdit({
    revisionId,
    appId,
    previous: current,
    next: result.next,
    changelog: result.changelog,
  });

  return NextResponse.json({ ok: true, changed: result.changed, removed: result.removed });
}
