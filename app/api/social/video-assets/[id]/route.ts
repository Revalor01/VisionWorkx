import { NextRequest, NextResponse } from "next/server";
import { createServerClient, createServiceClient } from "@/lib/supabase";
import { isAdminOrEditor } from "@/lib/social/authGuard";
import type { Database, SocialVideoStatus } from "@/lib/database.types";

type AssetUpdate = Database["public"]["Tables"]["social_video_assets"]["Update"];

const VALID_STATUSES: SocialVideoStatus[] = ["raw", "in_editing", "ready", "posted"];

// Polled by ContentTab while a background video-generation job
// (app/api/social/content/[id]/generate-video) is running.
export async function GET(_req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!(await isAdminOrEditor(user))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const service = createServiceClient();
  const { data: asset, error } = await service
    .from("social_video_assets")
    .select("*")
    .eq("id", params.id)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!asset) return NextResponse.json({ error: "Asset not found" }, { status: 404 });
  return NextResponse.json({ asset });
}

export async function PATCH(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!(await isAdminOrEditor(user))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: { status?: SocialVideoStatus; notes?: string; finalPath?: string; editorEmail?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const update: AssetUpdate = { updated_at: new Date().toISOString() };
  if (body.status !== undefined) {
    if (!VALID_STATUSES.includes(body.status)) {
      return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    }
    update.status = body.status;
  }
  if (body.notes !== undefined) update.notes = body.notes;
  if (body.finalPath !== undefined) update.final_path = body.finalPath;
  if (body.editorEmail !== undefined) update.editor_email = body.editorEmail;

  const service = createServiceClient();
  const { data, error } = await service
    .from("social_video_assets")
    .update(update)
    .eq("id", params.id)
    .select("id")
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Asset not found" }, { status: 404 });

  return NextResponse.json({ ok: true });
}

const BUCKET = "social-video-assets";

// Delete a generated/uploaded video asset: unlink it from any posts, remove its
// files from storage, and drop the row. Already-posted posts stay on-platform
// (this can't un-publish) — it only stops future use and frees storage.
export async function DELETE(_req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!(await isAdminOrEditor(user))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const service = createServiceClient();
  const { data: asset } = await service
    .from("social_video_assets")
    .select("id, raw_path, final_path")
    .eq("id", params.id)
    .maybeSingle();
  if (!asset) return NextResponse.json({ error: "Asset not found" }, { status: 404 });

  // Unlink from posts first so nothing tries to publish a now-missing file.
  await service.from("social_content").update({ video_asset_id: null }).eq("video_asset_id", params.id);
  await service.from("linkedin_posts").update({ video_asset_id: null }).eq("video_asset_id", params.id);

  const paths = [asset.raw_path, asset.final_path].filter((p): p is string => !!p);
  if (paths.length > 0) {
    const { error: removeError } = await service.storage.from(BUCKET).remove(paths);
    if (removeError) console.error(`[video-assets DELETE] storage remove failed for ${params.id}:`, removeError.message);
    // Don't abort on a storage miss — still delete the row so the asset stops showing.
  }

  const { error } = await service.from("social_video_assets").delete().eq("id", params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
